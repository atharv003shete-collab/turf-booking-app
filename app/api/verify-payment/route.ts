import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

interface VerificationResult {
  verdict: 'valid' | 'suspicious' | 'invalid';
  amount: number;
  receiver: string;
  status: string;
  transaction_id: string;
  reasons: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      poll_id,
      player_name,
      screenshot_url,
      expected_amount,
      host_payment_info,
      host_name,
    } = body;

    if (!poll_id || !player_name || !screenshot_url) {
      return NextResponse.json(
        { error: 'Missing required parameters (poll_id, player_name, screenshot_url).' },
        { status: 400 }
      );
    }

    const expectedNum = Number(expected_amount) || 0;

    // 1. Fetch the screenshot image bytes from the Supabase public URL
    let imageBase64 = '';
    let mimeType = 'image/png';

    try {
      const imgRes = await fetch(screenshot_url);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image from URL: ${imgRes.statusText}`);
      }
      const contentType = imgRes.headers.get('content-type');
      if (contentType && contentType.startsWith('image/')) {
        mimeType = contentType.split(';')[0];
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString('base64');
    } catch (fetchErr: any) {
      console.error('Error fetching screenshot image:', fetchErr);
      return NextResponse.json(
        { error: 'Could not fetch screenshot image from storage: ' + fetchErr.message },
        { status: 400 }
      );
    }

    // 2. Call Gemini API using @google/genai
    const apiKey = process.env.GEMINI_API_KEY;
    let geminiVerdict: VerificationResult = {
      verdict: 'suspicious',
      amount: 0,
      receiver: '',
      status: 'unknown',
      transaction_id: '',
      reasons: ['Gemini API verification uninitialized or skipped'],
    };

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `
You are an expert fraud detection and UPI/payment screenshot verification assistant.
Carefully analyze the provided payment confirmation screenshot (e.g. Google Pay, PhonePe, Paytm, BHIM, Bank App, CRED).

Expected Payment Details:
- Expected Amount: ₹${expectedNum}
- Expected Receiver Name/Host Name: "${host_name || ''}"
- Expected Receiver UPI / Phone: "${host_payment_info || ''}"

Extract and determine the following in STRICT valid JSON format:
{
  "verdict": "valid" | "suspicious" | "invalid",
  "amount": <number extracted from screenshot, 0 if not found>,
  "receiver": "<receiver name or UPI ID found on screenshot>",
  "status": "<e.g. Paid, Success, Processing, Failed, Completed>",
  "transaction_id": "<UPI transaction ID / UTR / Reference ID / order ID found>",
  "reasons": ["<bullet point explanation for your verdict>", "<any mismatch or confirmation details>"]
}

Guidelines for verdict:
- "valid": The payment is completed/success, the amount matches the expected amount (₹${expectedNum}) closely or exactly, and a valid transaction/UTR reference is present.
- "suspicious": Partial match, amount mismatch, blurry text, pending/processing status, or missing clear transaction reference.
- "invalid": Explicitly failed, declined, completely wrong receiver, or obvious fake/unrelated screenshot.

Return ONLY the raw JSON object, no markdown codeblocks, no commentary.
`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
        });

        const rawText = response.text ? response.text.trim() : '';
        const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
          const parsed = JSON.parse(cleanedText);
          geminiVerdict = {
            verdict: ['valid', 'suspicious', 'invalid'].includes(parsed.verdict)
              ? parsed.verdict
              : 'suspicious',
            amount: Number(parsed.amount) || 0,
            receiver: String(parsed.receiver || ''),
            status: String(parsed.status || ''),
            transaction_id: String(parsed.transaction_id || ''),
            reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [String(parsed.reasons || '')],
          };
        } catch (jsonErr) {
          console.warn('Could not parse Gemini JSON response:', rawText);
          geminiVerdict.reasons = ['Could not parse structured response from Gemini', rawText.substring(0, 100)];
        }
      } catch (geminiErr: any) {
        console.error('Gemini API call failed:', geminiErr);
        geminiVerdict = {
          verdict: 'suspicious',
          amount: 0,
          receiver: '',
          status: 'error',
          transaction_id: '',
          reasons: ['Gemini API error: ' + (geminiErr.message || 'Check GEMINI_API_KEY')],
        };
      }
    } else {
      geminiVerdict.reasons = ['GEMINI_API_KEY environment variable is not configured on server. Marked for manual review.'];
    }

    // 3. Server-side validation checks
    const finalReasons = [...geminiVerdict.reasons];
    let finalStatus: 'valid' | 'suspicious' | 'invalid' = geminiVerdict.verdict;

    // A. Check amount
    if (expectedNum > 0 && geminiVerdict.amount > 0) {
      if (Math.abs(geminiVerdict.amount - expectedNum) > 1) {
        finalStatus = 'suspicious';
        finalReasons.push(`Amount mismatch: Screenshot shows ₹${geminiVerdict.amount}, expected ₹${expectedNum}`);
      }
    }

    // B. Check duplicate transaction ID fraud across this poll or all polls
    const cleanTxId = geminiVerdict.transaction_id.trim();
    if (cleanTxId && cleanTxId.length > 4) {
      const { data: existingTx, error: txError } = await supabase
        .from('payments')
        .select('id, player_name, poll_id')
        .eq('transaction_id', cleanTxId)
        .neq('player_name', player_name)
        .limit(1);

      if (!txError && existingTx && existingTx.length > 0) {
        finalStatus = 'invalid';
        finalReasons.push(
          `FRAUD ALERT: Duplicate Transaction ID "${cleanTxId}" was already submitted by player "${existingTx[0].player_name}"!`
        );
      }
    }

    // 4. Save/Update record into payments table
    const paymentRecord = {
      poll_id,
      player_name,
      amount_paid: geminiVerdict.amount || expectedNum,
      expected_amount: expectedNum,
      screenshot_url,
      transaction_id: cleanTxId || null,
      receiver_name_or_upi: geminiVerdict.receiver || host_payment_info || null,
      gemini_verdict: finalStatus,
      final_status: finalStatus === 'valid' ? 'valid' : finalStatus === 'invalid' ? 'invalid' : 'pending',
      reasons: finalReasons,
      is_manual_override: false,
      updated_at: new Date().toISOString(),
    };

    const { data: savedPayment, error: saveError } = await supabase
      .from('payments')
      .insert([paymentRecord])
      .select()
      .single();

    if (saveError) {
      console.error('Supabase save payment error:', saveError);
      // Fallback: return verdict anyway so client gets instant feedback
      return NextResponse.json({
        success: true,
        payment: { ...paymentRecord, id: 'temp-' + Date.now() },
        verdict: finalStatus,
        warning: 'Payment verified, but saving to DB had error: ' + saveError.message,
      });
    }

    return NextResponse.json({
      success: true,
      payment: savedPayment,
      verdict: finalStatus,
    });
  } catch (err: any) {
    console.error('API /api/verify-payment error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error processing payment verification.' },
      { status: 500 }
    );
  }
}
