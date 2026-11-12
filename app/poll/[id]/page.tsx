'use client';

import { useEffect, useState, use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getTurfDetails } from '@/lib/turfs';
import Link from 'next/link';
import {
  MapPin,
  User,
  Users,
  CheckCircle2,
  XCircle,
  Share2,
  Copy,
  Check,
  ShieldCheck,
  ArrowLeft,
  Calendar,
  AlertCircle,
  Loader2,
  Clock,
  Phone,
  ExternalLink,
  ChevronRight,
  Plus,
  DollarSign,
  Upload,
  QrCode,
  Sparkles,
  Award,
  AlertTriangle,
  Receipt,
  FileCheck,
  Vote as VoteIcon,
} from 'lucide-react';

interface Poll {
  id: string | number;
  host_name: string;
  turf_name: string;
  status: string; // 'poll_1' | 'poll_2' | 'finalised'
  host_secret_token?: string;
  final_date?: string;
  final_time?: string;
  total_cost?: number;
  payment_info?: string;
  qr_code_url?: string;
  created_at?: string;
}

interface Vote {
  id?: string | number;
  poll_id: string | number;
  voter_name: string;
  coming: boolean;
  created_at?: string;
}

interface PollOption {
  id: string;
  poll_id: string | number;
  option_text?: string;
  label?: string;
  value?: string;
  type?: string;
  votes_count?: number;
  created_at?: string;
}

interface OptionVote {
  id: string;
  option_id: string;
  poll_id: string | number;
  voter_name: string;
}

interface PaymentRecord {
  id: string;
  poll_id: string | number;
  player_name: string;
  amount_paid: number;
  expected_amount: number;
  screenshot_url: string;
  transaction_id?: string;
  receiver_name_or_upi?: string;
  gemini_verdict: 'valid' | 'suspicious' | 'invalid';
  final_status: 'valid' | 'invalid' | 'pending';
  reasons: string[];
  is_manual_override: boolean;
  created_at?: string;
  updated_at?: string;
}

interface PollPageProps {
  params: Promise<{ id: string }>;
}

function PollContent({ params }: PollPageProps) {
  const resolvedParams = use(params);
  const pollId = resolvedParams.id;
  const searchParams = useSearchParams();
  const isHostQuery = searchParams.get('host') === 'true';

  const [poll, setPoll] = useState<Poll | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [optionVotes, setOptionVotes] = useState<OptionVote[]>([]);
  const [userVotes, setUserVotes] = useState<{ [optionId: string]: boolean }>({});
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User identity & role state
  const [voterName, setVoterName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);

  // Voting state (Phase 1)
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Phase 2 state: WhatsApp-style combined option
  const [newCombinedOption, setNewCombinedOption] = useState('');
  const [addingOption, setAddingOption] = useState(false);
  const [optionActionId, setOptionActionId] = useState<string | null>(null);
  const [advancingPhase, setAdvancingPhase] = useState(false);

  // Finalisation form state (Phase 2 -> Finalised)
  const [finalDate, setFinalDate] = useState('');
  const [finalTime, setFinalTime] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [paymentInfo, setPaymentInfo] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [isFinalising, setIsFinalising] = useState(false);
  const [finaliseError, setFinaliseError] = useState<string | null>(null);

  // Phase 3: Player Payment Screenshot Upload State
  const [paymentScreenshotFile, setPaymentScreenshotFile] = useState<File | null>(null);
  const [isUploadingPayment, setIsUploadingPayment] = useState(false);
  const [paymentUploadMsg, setPaymentUploadMsg] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
    details?: any;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Host manual override action loading state
  const [overrideLoadingId, setOverrideLoadingId] = useState<string | null>(null);

  // Load voter name & host authorization check
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('turf_voter_name');
      if (savedName) setVoterName(savedName);

      const storedToken = localStorage.getItem(`poll_${pollId}_host_token`);
      if (isHostQuery || storedToken) {
        setIsHost(true);
      }
    }
  }, [pollId, isHostQuery]);

  // Fetch all poll data, votes, options, payments
  const fetchPollData = async () => {
    try {
      // 1. Fetch Poll
      const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .select('*')
        .eq('id', pollId)
        .single();

      if (pollError) throw pollError;
      if (!pollData) throw new Error('Poll not found');
      setPoll(pollData);

      // Verify host token if stored matches
      if (typeof window !== 'undefined') {
        const storedToken = localStorage.getItem(`poll_${pollId}_host_token`);
        if (storedToken && pollData.host_secret_token === storedToken) {
          setIsHost(true);
        } else if (isHostQuery) {
          setIsHost(true);
        }
      }

      // 2. Fetch Votes (Phase 1)
      const { data: voteData, error: voteError } = await supabase
        .from('votes')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: false });

      if (voteError && voteError.code !== 'PGRST116') {
        console.warn('Votes fetch:', voteError);
      }
      setVotes(voteData || []);

      // 3. Fetch Poll Options (Phase 2 WhatsApp Options)
      const { data: optData, error: optError } = await supabase
        .from('poll_options')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: true });

      if (optError && optError.code !== '42P01') {
        console.warn('Poll options fetch error:', optError);
      }
      setOptions(optData || []);

      // 4. Fetch Option Votes
      const { data: optVoteData, error: optVoteError } = await supabase
        .from('option_votes')
        .select('*')
        .eq('poll_id', pollId);

      if (optVoteError && optVoteError.code !== '42P01') {
        console.warn('Option votes fetch error:', optVoteError);
      }
      const fetchedOptionVotes: OptionVote[] = optVoteData || [];
      setOptionVotes(fetchedOptionVotes);

      // Populate userVotes map for the current voter
      const activeName = (
        (typeof window !== 'undefined' ? localStorage.getItem('voter_name') || localStorage.getItem('turf_voter_name') : '') || voterName
      ).trim().toLowerCase();

      if (activeName) {
        const votesMap: { [optionId: string]: boolean } = {};
        fetchedOptionVotes.forEach((ov) => {
          if (ov.voter_name.trim().toLowerCase() === activeName) {
            votesMap[ov.option_id] = true;
          }
        });
        setUserVotes(votesMap);
      }

      // 5. Fetch Payments (Phase 3)
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: false });

      if (paymentError && paymentError.code !== '42P01') {
        console.warn('Payments fetch error:', paymentError);
      }
      setPayments(paymentData || []);
    } catch (err: any) {
      console.error('Error fetching poll data:', err);
      setErrorMsg(err.message || 'Could not load poll details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPollData();

    // Supabase Realtime subscriptions
    const pollChannel = supabase
      .channel(`realtime:poll:${pollId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, () => {
        fetchPollData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `poll_id=eq.${pollId}` }, () => {
        fetchPollData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_options', filter: `poll_id=eq.${pollId}` }, () => {
        fetchPollData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'option_votes', filter: `poll_id=eq.${pollId}` }, () => {
        fetchPollData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `poll_id=eq.${pollId}` }, () => {
        fetchPollData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pollChannel);
    };
  }, [pollId]);

  // Phase 1: Attendance Vote
  const handleAttendanceVote = async (coming: boolean) => {
    const trimmedName = voterName.trim();
    if (!trimmedName) {
      setFeedbackMsg({ type: 'error', text: 'Please enter your name to vote.' });
      return;
    }

    setVoteSubmitting(true);
    setFeedbackMsg(null);

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('voter_name', trimmedName);
        localStorage.setItem('turf_voter_name', trimmedName);
      }

      const { error } = await supabase.from('votes').upsert(
        {
          poll_id: pollId,
          voter_name: trimmedName,
          coming: coming,
        },
        { onConflict: 'poll_id,voter_name' }
      );

      if (error) throw error;

      setFeedbackMsg({
        type: 'success',
        text: coming ? `Great! You voted: "Yes, I'm in!"` : `Recorded: "Not coming".`,
      });
      await fetchPollData();
    } catch (err: any) {
      console.error('Error submitting vote:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to submit vote. Please try again.',
      });
    } finally {
      setVoteSubmitting(false);
    }
  };

  // Advance to Phase 2 (Host Only)
  const handleAdvanceToPoll2 = async () => {
    if (!poll) return;
    setAdvancingPhase(true);
    try {
      const { error } = await supabase
        .from('polls')
        .update({ status: 'poll_2' })
        .eq('id', pollId);

      if (error) throw error;
      await fetchPollData();
    } catch (err: any) {
      console.error('Error advancing poll phase:', err);
      alert('Could not advance phase: ' + (err.message || 'Error occurred'));
    } finally {
      setAdvancingPhase(false);
    }
  };

  // Phase 2: Add WhatsApp-style combined Date & Time Option
  const handleAddCombinedOption = async (e: React.FormEvent) => {
    e.preventDefault();
    const optionValue = newCombinedOption.trim();
    if (!optionValue) return;

    setAddingOption(true);
    try {
      // Send both 'option_text' and 'label' with the same string value
      const { error } = await supabase.from('poll_options').insert({
        poll_id: pollId,
        option_text: optionValue,
        label: optionValue,
      });

      if (error) {
        // Fallback for schemas with strict column checks (e.g. if 'label' or 'option_text' alone is allowed)
        console.warn('Initial insert attempt error:', error.message);
        const fallback1 = await supabase.from('poll_options').insert({
          poll_id: pollId,
          option_text: optionValue,
        });
        if (fallback1.error) {
          const fallback2 = await supabase.from('poll_options').insert({
            poll_id: pollId,
            label: optionValue,
          });
          if (fallback2.error) {
            throw fallback2.error;
          }
        }
      }

      setNewCombinedOption('');

      // Immediately re-fetch the options list and poll data so UI updates instantly
      const { data: optData } = await supabase
        .from('poll_options')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: true });

      if (optData) {
        setOptions(optData);
      }

      await fetchPollData();
    } catch (err: any) {
      console.error('Error adding option:', err);
      alert('Failed to add option: ' + err.message);
    } finally {
      setAddingOption(false);
    }
  };

  // Helper to re-fetch votes list from Supabase to sync counts and voter names
  const fetchVotesData = async () => {
    try {
      const { data: latestVotes, error } = await supabase
        .from('option_votes')
        .select('*')
        .eq('poll_id', pollId);

      if (!error && latestVotes) {
        setOptionVotes(latestVotes);

        const activeName = (
          (typeof window !== 'undefined'
            ? localStorage.getItem('voter_name') || localStorage.getItem('turf_voter_name')
            : '') || voterName
        ).trim().toLowerCase();

        if (activeName) {
          const votesMap: { [optionId: string]: boolean } = {};
          latestVotes.forEach((ov) => {
            if (ov.voter_name.trim().toLowerCase() === activeName) {
              votesMap[ov.option_id] = true;
            }
          });
          setUserVotes(votesMap);
        }
      }
    } catch (err) {
      console.error('Error in fetchVotesData:', err);
    }
  };

  // Phase 2: Multi-option WhatsApp-style voting (handleVote)
  const handleVote = async (optionId: string) => {
    const voterNameStr =
      (typeof window !== 'undefined'
        ? localStorage.getItem('voter_name') || localStorage.getItem('turf_voter_name')
        : '') || voterName.trim() || 'Guest';

    // Keep voter_name synced in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('voter_name', voterNameStr);
      localStorage.setItem('turf_voter_name', voterNameStr);
    }

    const existingVote = !!userVotes[optionId]; // tracks if current user voted for this option

    // 1. Optimistically update local UI state immediately
    setUserVotes((prev) => ({ ...prev, [optionId]: !existingVote }));

    // Also optimistically reflect in optionVotes for live badges & names
    if (existingVote) {
      setOptionVotes((prev) =>
        prev.filter(
          (ov) =>
            !(
              ov.option_id === optionId &&
              ov.voter_name.trim().toLowerCase() === voterNameStr.toLowerCase()
            )
        )
      );
    } else {
      setOptionVotes((prev) => [
        ...prev,
        {
          id: `opt-${optionId}-${Date.now()}`,
          option_id: optionId,
          poll_id: pollId,
          voter_name: voterNameStr,
        },
      ]);
    }

    if (existingVote) {
      // Remove vote from database
      const { error } = await supabase
        .from('option_votes')
        .delete()
        .eq('option_id', optionId)
        .eq('voter_name', voterNameStr);

      if (error) {
        // Revert on failure
        setUserVotes((prev) => ({ ...prev, [optionId]: true }));
        console.error('Error removing vote:', error);
      }
    } else {
      // Add vote to database
      const { error } = await supabase.from('option_votes').insert({
        option_id: optionId,
        poll_id: pollId,
        voter_name: voterNameStr,
      });

      if (error) {
        // Revert on failure
        setUserVotes((prev) => ({ ...prev, [optionId]: false }));
        console.error('Error adding vote:', error);
      }
    }

    // Refresh votes list from Supabase to sync counts and voter names
    await fetchVotesData();
  };

  // Finalise Poll Form Submission (Host Only)
  const handleFinalisePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalDate.trim() || !finalTime.trim() || !totalCost) {
      setFinaliseError('Please enter final date, final time, and total turf cost.');
      return;
    }

    setIsFinalising(true);
    setFinaliseError(null);

    try {
      let uploadedQrUrl: string | undefined = undefined;

      if (qrFile) {
        const fileExt = qrFile.name.split('.').pop() || 'png';
        const fileName = `qr_${pollId}_${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('screenshots')
          .upload(fileName, qrFile, { upsert: true });

        if (!uploadErr && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from('screenshots')
            .getPublicUrl(fileName);
          uploadedQrUrl = publicUrlData?.publicUrl;
        } else if (uploadErr) {
          console.warn('QR upload warning:', uploadErr.message);
        }
      }

      const { error } = await supabase
        .from('polls')
        .update({
          status: 'finalised',
          final_date: finalDate.trim(),
          final_time: finalTime.trim(),
          total_cost: parseFloat(totalCost),
          payment_info: paymentInfo.trim() || null,
          qr_code_url: uploadedQrUrl || poll?.qr_code_url || null,
        })
        .eq('id', pollId);

      if (error) throw error;

      await fetchPollData();
    } catch (err: any) {
      console.error('Error finalising poll:', err);
      setFinaliseError(err.message || 'Failed to finalise venue booking.');
    } finally {
      setIsFinalising(false);
    }
  };

  // Phase 3: Player Payment Screenshot Upload & Gemini API Verification
  const handleUploadPaymentScreenshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = voterName.trim();
    if (!trimmedName) {
      setPaymentUploadMsg({ type: 'error', text: 'Please enter your player name first.' });
      return;
    }

    if (!paymentScreenshotFile) {
      setPaymentUploadMsg({ type: 'error', text: 'Please choose a payment screenshot to upload.' });
      return;
    }

    setIsUploadingPayment(true);
    setPaymentUploadMsg(null);

    try {
      const fileExt = paymentScreenshotFile.name.split('.').pop() || 'png';
      const cleanPlayerName = trimmedName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const fileName = `payment_${pollId}_${cleanPlayerName}_${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(fileName, paymentScreenshotFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw new Error('Supabase Storage upload failed: ' + uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from('screenshots')
        .getPublicUrl(fileName);

      const screenshotPublicUrl = publicUrlData.publicUrl;

      const res = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poll_id: pollId,
          player_name: trimmedName,
          screenshot_url: screenshotPublicUrl,
          expected_amount: costPerPerson,
          host_payment_info: poll?.payment_info || '',
          host_name: poll?.host_name || '',
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Server error while verifying screenshot.');
      }

      const verdict = result.verdict || result.payment?.gemini_verdict;
      if (verdict === 'valid') {
        setPaymentUploadMsg({
          type: 'success',
          text: 'Payment Verified! Gemini confirmed your payment details.',
          details: result.payment,
        });
      } else if (verdict === 'suspicious') {
        setPaymentUploadMsg({
          type: 'warning',
          text: 'Payment Flagged for Host Review: Gemini detected discrepancies or unconfirmed details.',
          details: result.payment,
        });
      } else {
        setPaymentUploadMsg({
          type: 'error',
          text: 'Payment Flagged as Invalid by Gemini. Please check the reasons below or verify with the host.',
          details: result.payment,
        });
      }

      setPaymentScreenshotFile(null);
      setPreviewUrl(null);
      await fetchPollData();
    } catch (err: any) {
      console.error('Payment upload error:', err);
      setPaymentUploadMsg({
        type: 'error',
        text: err.message || 'Failed to process screenshot.',
      });
    } finally {
      setIsUploadingPayment(false);
    }
  };

  // Host Manual Override: Change final_status to 'valid' or 'invalid'
  const handleHostManualOverride = async (paymentId: string, newStatus: 'valid' | 'invalid') => {
    setOverrideLoadingId(paymentId);
    try {
      const { error } = await supabase
        .from('payments')
        .update({
          final_status: newStatus,
          is_manual_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      if (error) throw error;
      await fetchPollData();
    } catch (err: any) {
      console.error('Host override error:', err);
      alert('Failed to override status: ' + err.message);
    } finally {
      setOverrideLoadingId(null);
    }
  };

  const copyShareLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/poll/${pollId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const turfInfo = poll ? getTurfDetails(poll.turf_name) : null;
  const comingList = votes.filter((v) => v.coming);
  const notComingList = votes.filter((v) => !v.coming);

  // Helper to extract option text whether stored in 'option_text', 'label', or 'value'
  const getOptionLabel = (opt: PollOption) => opt.option_text || opt.label || opt.value || 'Untitled Option';

  // Count helper
  const getVotesForOption = (optionId: string) => {
    return optionVotes.filter((ov) => ov.option_id === optionId);
  };
  const hasUserVotedOption = (optionId: string) => {
    if (userVotes[optionId] !== undefined) {
      return !!userVotes[optionId];
    }
    const currentName = (
      (typeof window !== 'undefined'
        ? localStorage.getItem('voter_name') || localStorage.getItem('turf_voter_name')
        : '') || voterName
    ).trim().toLowerCase();
    return optionVotes.some(
      (ov) => ov.option_id === optionId && ov.voter_name.toLowerCase() === currentName
    );
  };

  // WhatsApp Poll stats calculation
  const totalOptionVotesCount = optionVotes.length;
  const maxVotesOnAnyOption = Math.max(
    1,
    ...options.map((opt) => getVotesForOption(opt.id).length)
  );

  // Cost split calculation for finalised view
  const confirmedPlayersCount = comingList.length > 0 ? comingList.length : 1;
  const costPerPerson = poll?.total_cost ? Math.ceil(poll.total_cost / confirmedPlayersCount) : 0;

  // Player's existing payment record if any
  const currentPlayerPayment = payments.find(
    (p) => p.player_name.toLowerCase() === voterName.trim().toLowerCase()
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-zinc-400 text-sm">Loading poll details...</p>
      </div>
    );
  }

  if (errorMsg || !poll) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Poll Not Found</h2>
          <p className="text-zinc-400 text-sm mb-6">{errorMsg || 'This poll does not exist or could not be loaded.'}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Create a New Poll
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 text-zinc-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
        {/* Top Navbar */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-zinc-400 hover:text-emerald-400 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <button
            onClick={copyShareLink}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs sm:text-sm text-zinc-200 border border-zinc-700/60 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Poll Link</span>
              </>
            )}
          </button>
        </div>

        {/* Host Banner */}
        {isHost && (
          <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>You are viewing as the <strong>Host</strong> ({poll.host_name}).</span>
            </div>
            <span className="text-[11px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 uppercase tracking-wider font-semibold">
              Host Controls Active
            </span>
          </div>
        )}

        {/* Turf Header & Venue Hub Card */}
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
              {poll.status === 'poll_1' && 'Phase 1: Attendance'}
              {poll.status === 'poll_2' && 'Phase 2: WhatsApp-style Date & Time Poll'}
              {poll.status === 'finalised' && '🎉 Game Finalised & Booked'}
            </div>
            {poll.created_at && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(poll.created_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-white mb-3 flex items-center gap-2">
            <MapPin className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400 shrink-0" />
            <span>{poll.turf_name}</span>
          </h1>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center gap-2 text-zinc-300 text-sm">
              <User className="w-4 h-4 text-emerald-400" />
              <span>Host: <strong className="text-zinc-100">{poll.host_name}</strong></span>
            </div>

            {turfInfo && (
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${turfInfo.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-zinc-950 font-semibold text-xs transition"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call Venue ({turfInfo.phone})</span>
                </a>
                <a
                  href={turfInfo.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Maps</span>
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Global Voter Identity Bar */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-zinc-300">
            <User className="w-4 h-4 text-emerald-400" />
            <span>Voting / Playing as:</span>
            <input
              type="text"
              value={voterName}
              onChange={(e) => {
                setVoterName(e.target.value);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('turf_voter_name', e.target.value);
                }
              }}
              placeholder="Enter your name..."
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-white text-xs outline-none focus:border-emerald-400 font-medium"
            />
          </div>
          <span className="text-zinc-500 text-xs">Tap any poll option to vote or unvote</span>
        </div>

        {/* ========================================================================= */}
        {/* PHASE 1: Attendance Section */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Player Attendance ({comingList.length} Confirmed)
              </h2>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                Confirm whether you are coming so the host can plan slot bookings.
              </p>
            </div>

            {isHost && poll.status === 'poll_1' && (
              <button
                onClick={handleAdvanceToPoll2}
                disabled={advancingPhase}
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 cursor-pointer transition disabled:opacity-60"
              >
                {advancingPhase ? 'Advancing...' : (
                  <>
                    <span>Next: Date/Time Poll</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>

          {feedbackMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs sm:text-sm border ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/60 border-red-500/40 text-red-300'
              }`}
            >
              {feedbackMsg.text}
            </div>
          )}

          {/* Attendance Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={voteSubmitting || poll.status === 'finalised'}
              onClick={() => handleAttendanceVote(true)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/30"
            >
              <CheckCircle2 className="w-4 h-4" />
              Yes, I&apos;m in!
            </button>

            <button
              type="button"
              disabled={voteSubmitting || poll.status === 'finalised'}
              onClick={() => handleAttendanceVote(false)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-500/40 border border-zinc-700 text-zinc-300 active:scale-[0.99] font-semibold text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              Not coming
            </button>
          </div>

          {/* Attendance List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
            {/* Playing */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Playing ({comingList.length})
              </div>
              {comingList.length === 0 ? (
                <p className="text-zinc-600 text-xs italic">No confirmations yet</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {comingList.map((vote) => (
                    <div
                      key={vote.id || `${vote.poll_id}-${vote.voter_name}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-zinc-200"
                    >
                      <span className="font-medium text-emerald-300">{vote.voter_name}</span>
                      <span className="text-emerald-400 text-xs flex items-center gap-1">
                        <Check className="w-3 h-3" /> In
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Not Coming */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                Not Coming ({notComingList.length})
              </div>
              {notComingList.length === 0 ? (
                <p className="text-zinc-600 text-xs italic">Nobody declined yet</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {notComingList.map((vote) => (
                    <div
                      key={vote.id || `${vote.poll_id}-${vote.voter_name}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-950/40 border border-zinc-800 text-xs text-zinc-400"
                    >
                      <span>{vote.voter_name}</span>
                      <span className="text-rose-400/80 text-xs">Out</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PHASE 2: WhatsApp-Style Multi-Option Date & Time Poll */}
        {/* ========================================================================= */}
        {(poll.status === 'poll_2' || poll.status === 'finalised') && (
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-800 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1 border border-emerald-500/20">
                  <VoteIcon className="w-3.5 h-3.5" /> WhatsApp-Style Multi-Vote Poll
                </div>
                <h2 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
                  Preferred Date & Time Options
                </h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-0.5">
                  Select multiple options that work for you. You can tap again to unvote anytime.
                </p>
              </div>

              {poll.status === 'poll_2' && isHost && (
                <div className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                  ⚡ As Host, pick the final winner below when ready!
                </div>
              )}
            </div>

            {/* Combined Option Input Form */}
            {poll.status !== 'finalised' && (
              <form onSubmit={handleAddCombinedOption} className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-300">
                  Add a Date & Time Option
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCombinedOption}
                    onChange={(e) => setNewCombinedOption(e.target.value)}
                    placeholder='e.g. "Sat 15 Nov, 7:00 PM - 8:00 PM" or "Sun 16 Nov, 8:00 PM - 9:00 PM"'
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950/90 border border-zinc-700 text-white placeholder-zinc-500 text-xs sm:text-sm outline-none focus:border-emerald-400 transition"
                  />
                  <button
                    type="submit"
                    disabled={addingOption || !newCombinedOption.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-950/50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Option</span>
                  </button>
                </div>
              </form>
            )}

            {/* WhatsApp-Style Poll Options List */}
            <div className="space-y-3 pt-2">
              {options.length === 0 ? (
                <div className="text-center py-8 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800 text-zinc-500 text-xs sm:text-sm">
                  No date & time options added yet. Type an option above (e.g. &quot;Sat 15 Nov, 7:00 PM - 8:00 PM&quot;) and tap <strong>Add Option</strong>.
                </div>
              ) : (
                options.map((opt) => {
                  const optVoters = getVotesForOption(opt.id);
                  const isVoted = hasUserVotedOption(opt.id);
                  const label = getOptionLabel(opt);
                  const votePercentage = Math.round((optVoters.length / maxVotesOnAnyOption) * 100);

                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        if (poll.status !== 'finalised') {
                          handleVote(opt.id);
                        }
                      }}
                      className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-150 select-none ${
                        poll.status !== 'finalised' ? 'cursor-pointer hover:border-emerald-500/60' : 'cursor-default'
                      } ${
                        isVoted
                          ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-950/40'
                          : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900/60'
                      }`}
                    >
                      {/* WhatsApp-Style Progress Fill Background */}
                      <div
                        className={`absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none ${
                          isVoted ? 'bg-emerald-500/15' : 'bg-zinc-800/25'
                        }`}
                        style={{ width: `${votePercentage}%` }}
                      />

                      <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* WhatsApp-Style Circular Checkbox Indicator */}
                          <div
                            className={`w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                              isVoted
                                ? 'bg-emerald-500 border-emerald-500 text-zinc-950 shadow-sm'
                                : 'border-zinc-600 bg-zinc-900/80'
                            }`}
                          >
                            {isVoted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>

                          {/* Option Text and Voter Avatar Names */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className={`text-sm sm:text-base font-semibold ${isVoted ? 'text-white' : 'text-zinc-200'}`}>
                              {label}
                            </div>

                            {/* Voters list pill */}
                            {optVoters.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {optVoters.map((v) => (
                                  <span
                                    key={v.id || v.voter_name}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                      v.voter_name.toLowerCase() === voterName.trim().toLowerCase()
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'
                                    }`}
                                  >
                                    <User className="w-2.5 h-2.5" />
                                    {v.voter_name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11px] text-zinc-500 italic">No votes yet</div>
                            )}
                          </div>
                        </div>

                        {/* Vote count badge */}
                        <div className="text-right shrink-0">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                              isVoted
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {optVoters.length} {optVoters.length === 1 ? 'vote' : 'votes'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* HOST FINALISATION (Phase 2 -> Finalised) */}
        {/* ========================================================================= */}
        {poll.status === 'poll_2' && isHost && (
          <div className="bg-gradient-to-br from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" />
                  Host Finalisation & Venue Booking Hub
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Call the venue to lock in the slot, then confirm match details and payment method for players.
                </p>
              </div>
            </div>

            {turfInfo && (
              <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">Official Venue Booking Line</div>
                    <div className="text-sm font-bold text-white">{turfInfo.name}</div>
                    <div className="text-xs text-emerald-400 font-mono">{turfInfo.phone}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${turfInfo.phone.replace(/\s+/g, '')}`}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition"
                  >
                    <Phone className="w-4 h-4" />
                    Call Venue Now
                  </a>
                  <a
                    href={turfInfo.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Maps
                  </a>
                </div>
              </div>
            )}

            {finaliseError && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs sm:text-sm">
                {finaliseError}
              </div>
            )}

            <form onSubmit={handleFinalisePoll} className="space-y-4">
              {/* Quick Select from Voted Options */}
              {options.length > 0 && (
                <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-300 block mb-2">
                    Quick-Fill from Leading Poll Options:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {options.map((o) => {
                      const vCount = getVotesForOption(o.id).length;
                      const label = getOptionLabel(o);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            // Split on comma or hyphen if present
                            if (label.includes(',')) {
                              const [d, ...t] = label.split(',');
                              setFinalDate(d.trim());
                              setFinalTime(t.join(',').trim());
                            } else {
                              setFinalDate(label);
                            }
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-600 hover:text-zinc-950 text-zinc-200 border border-zinc-700 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <VoteIcon className="w-3 h-3 text-emerald-400" />
                          <span>{label}</span>
                          <span className="text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded text-emerald-400 font-bold">
                            {vCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="finalDate" className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    Final Date
                  </label>
                  <input
                    id="finalDate"
                    type="text"
                    value={finalDate}
                    onChange={(e) => setFinalDate(e.target.value)}
                    placeholder="e.g. Sat, 15 Nov"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 focus:border-emerald-400 text-white text-xs sm:text-sm outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="finalTime" className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    Final Time
                  </label>
                  <input
                    id="finalTime"
                    type="text"
                    value={finalTime}
                    onChange={(e) => setFinalTime(e.target.value)}
                    placeholder="e.g. 7:00 PM - 8:00 PM"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 focus:border-emerald-400 text-white text-xs sm:text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label htmlFor="totalCost" className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Total Turf Cost (₹)
                  </label>
                  <input
                    id="totalCost"
                    type="number"
                    min="0"
                    step="50"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    placeholder="e.g. 1500"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 focus:border-emerald-400 text-white text-xs sm:text-sm outline-none"
                  />
                  {totalCost && comingList.length > 0 && (
                    <p className="text-[11px] text-emerald-400 mt-1">
                      ≈ ₹{Math.ceil(parseFloat(totalCost) / comingList.length)} per confirmed player ({comingList.length} playing)
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="paymentInfo" className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                    Payment UPI ID or Phone
                  </label>
                  <input
                    id="paymentInfo"
                    type="text"
                    value={paymentInfo}
                    onChange={(e) => setPaymentInfo(e.target.value)}
                    placeholder="e.g. 9820012345@upi or phone number"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 focus:border-emerald-400 text-white text-xs sm:text-sm outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  Upload Payment QR Screenshot (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setQrFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isFinalising}
                className="w-full mt-4 py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
              >
                {isFinalising ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finalising & Locking Details...
                  </>
                ) : (
                  <>
                    <Award className="w-4 h-4" />
                    Finalise Match & Launch Payment Hub
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FINALISED VIEW: Payment & Split Dashboard + Player Upload + Host Table */}
        {/* ========================================================================= */}
        {poll.status === 'finalised' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-emerald-950/80 via-zinc-900 to-zinc-950 border border-emerald-500/50 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-800 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
                    <Sparkles className="w-3.5 h-3.5" /> Match Locked & Confirmed
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    Payment & Split Dashboard
                  </h2>
                </div>

                {turfInfo && (
                  <a
                    href={`tel:${turfInfo.phone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Call {turfInfo.name}</span>
                  </a>
                )}
              </div>

              {/* Match Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400 flex items-center gap-1 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Date
                  </span>
                  <span className="text-sm font-bold text-white">{poll.final_date || 'TBD'}</span>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400 flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" /> Time
                  </span>
                  <span className="text-sm font-bold text-white">{poll.final_time || 'TBD'}</span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                  <span className="text-xs text-emerald-300 flex items-center gap-1 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Per Person Split
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    ₹{costPerPerson}
                    <span className="text-xs font-normal text-zinc-400 ml-1">
                      (Total: ₹{poll.total_cost || 0} / {confirmedPlayersCount})
                    </span>
                  </span>
                </div>
              </div>

              {/* Payment Details Card */}
              <div className="p-5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-4">
                <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  Host Payment Details ({poll.host_name})
                </h4>

                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {poll.qr_code_url ? (
                    <div className="p-2 bg-white rounded-xl shadow-lg shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={poll.qr_code_url}
                        alt="Payment QR Code"
                        className="w-36 h-36 object-contain rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="w-36 h-36 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 p-2 text-center text-xs shrink-0">
                      <QrCode className="w-8 h-8 mb-1 text-zinc-600" />
                      <span>No QR uploaded</span>
                    </div>
                  )}

                  <div className="space-y-2 text-center sm:text-left">
                    <div className="text-xs text-zinc-400">UPI ID / Phone:</div>
                    <div className="text-base font-bold text-emerald-300 font-mono bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 inline-block">
                      {poll.payment_info || 'Ask host directly for UPI info'}
                    </div>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      Please send <strong>₹{costPerPerson}</strong> and upload your payment confirmation screenshot below.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PLAYER PAYMENT & SCREENSHOT UPLOAD COMPONENT */}
            <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-400" />
                    Submit Payment Screenshot
                  </h3>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                    Upload your UPI confirmation screenshot (GPay, PhonePe, Paytm) for AI verification by Gemini.
                  </p>
                </div>

                {currentPlayerPayment && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Your status:</span>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${
                        currentPlayerPayment.final_status === 'valid'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : currentPlayerPayment.final_status === 'invalid'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {currentPlayerPayment.final_status}
                    </span>
                  </div>
                )}
              </div>

              {paymentUploadMsg && (
                <div
                  className={`p-4 rounded-xl text-xs sm:text-sm border ${
                    paymentUploadMsg.type === 'success'
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                      : paymentUploadMsg.type === 'warning'
                      ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                      : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <div className="font-semibold mb-1">{paymentUploadMsg.text}</div>
                  {paymentUploadMsg.details?.reasons && (
                    <ul className="list-disc pl-4 space-y-0.5 text-xs opacity-90">
                      {paymentUploadMsg.details.reasons.map((r: string, idx: number) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {paymentUploadMsg.details?.transaction_id && (
                    <div className="text-[11px] font-mono mt-1 opacity-80">
                      Txn ID: {paymentUploadMsg.details.transaction_id}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleUploadPaymentScreenshot} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      Player Name
                    </label>
                    <input
                      type="text"
                      value={voterName}
                      onChange={(e) => setVoterName(e.target.value)}
                      placeholder="e.g. Atharv Shete"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 focus:border-emerald-400 text-white text-xs sm:text-sm outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      Amount to Pay
                    </label>
                    <div className="px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-emerald-400 font-bold text-xs sm:text-sm">
                      ₹{costPerPerson}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    Payment Screenshot File
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setPaymentScreenshotFile(file);
                        setPreviewUrl(URL.createObjectURL(file));
                      }
                    }}
                    className="w-full text-xs text-zinc-400 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer"
                  />
                </div>

                {previewUrl && (
                  <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-16 h-16 object-cover rounded-lg border border-zinc-700"
                    />
                    <div className="text-xs text-zinc-300">
                      <div className="font-semibold text-white">{paymentScreenshotFile?.name}</div>
                      <div className="text-zinc-500">{(paymentScreenshotFile!.size / 1024).toFixed(1)} KB • Ready for AI verification</div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploadingPayment || !paymentScreenshotFile}
                  className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
                >
                  {isUploadingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gemini AI is Verifying Screenshot...
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4" />
                      Upload & Verify Payment with Gemini
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* HOST MANAGEMENT DASHBOARD TABLE */}
            {isHost && (
              <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-800 pb-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      Host Management Dashboard
                    </h3>
                    <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                      Track attendance, AI verification verdicts from Gemini, and override payment statuses when needed.
                    </p>
                  </div>
                  <div className="text-xs font-medium text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                    Total Collected: ₹
                    {payments
                      .filter((p) => p.final_status === 'valid')
                      .reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0)}
                    {' '}/ ₹{poll.total_cost || 0}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[11px] tracking-wider">
                        <th className="py-3 px-3">Player</th>
                        <th className="py-3 px-3">Attendance</th>
                        <th className="py-3 px-3">Gemini Verdict</th>
                        <th className="py-3 px-3">Amount & Txn ID</th>
                        <th className="py-3 px-3">Screenshot</th>
                        <th className="py-3 px-3 text-right">Host Override</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {Array.from(
                        new Set([...comingList.map((v) => v.voter_name), ...payments.map((p) => p.player_name)])
                      ).map((playerName) => {
                        const playerVote = votes.find(
                          (v) => v.voter_name.toLowerCase() === playerName.toLowerCase()
                        );
                        const playerPayment = payments.find(
                          (p) => p.player_name.toLowerCase() === playerName.toLowerCase()
                        );

                        return (
                          <tr key={playerName} className="hover:bg-zinc-800/30 transition">
                            <td className="py-3.5 px-3 font-semibold text-white">
                              {playerName}
                              {poll.host_name.toLowerCase() === playerName.toLowerCase() && (
                                <span className="ml-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                  Host
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-3">
                              {playerVote?.coming ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Playing
                                </span>
                              ) : playerVote ? (
                                <span className="inline-flex items-center gap-1 text-zinc-500 text-xs">
                                  <XCircle className="w-3.5 h-3.5" /> Not Coming
                                </span>
                              ) : (
                                <span className="text-zinc-600 text-xs">No vote</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3">
                              {playerPayment ? (
                                <div className="space-y-1">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                                      playerPayment.gemini_verdict === 'valid'
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : playerPayment.gemini_verdict === 'invalid'
                                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    }`}
                                  >
                                    {playerPayment.gemini_verdict === 'valid' && <CheckCircle2 className="w-3 h-3" />}
                                    {playerPayment.gemini_verdict === 'invalid' && <XCircle className="w-3 h-3" />}
                                    {playerPayment.gemini_verdict === 'suspicious' && <AlertTriangle className="w-3 h-3" />}
                                    {playerPayment.gemini_verdict}
                                  </span>

                                  {playerPayment.is_manual_override && (
                                    <div className="text-[10px] text-zinc-400 italic">
                                      Status: <strong className="text-white">{playerPayment.final_status}</strong> (Overridden)
                                    </div>
                                  )}

                                  {playerPayment.reasons && playerPayment.reasons.length > 0 && (
                                    <div className="text-[10px] text-zinc-400 max-w-xs truncate" title={playerPayment.reasons.join('\n')}>
                                      {playerPayment.reasons[0]}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-500 text-xs italic">Unpaid</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3">
                              {playerPayment ? (
                                <div>
                                  <div className="font-semibold text-white">
                                    ₹{playerPayment.amount_paid}
                                  </div>
                                  <div className="text-[10px] font-mono text-zinc-400 truncate max-w-[120px]" title={playerPayment.transaction_id || 'N/A'}>
                                    Txn: {playerPayment.transaction_id || 'N/A'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-zinc-600 text-xs">—</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3">
                              {playerPayment?.screenshot_url ? (
                                <a
                                  href={playerPayment.screenshot_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 underline"
                                >
                                  View
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-zinc-600 text-xs">—</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3 text-right">
                              {playerPayment ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={overrideLoadingId === playerPayment.id}
                                    onClick={() => handleHostManualOverride(playerPayment.id, 'valid')}
                                    className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition ${
                                      playerPayment.final_status === 'valid'
                                        ? 'bg-emerald-500 text-zinc-950 font-bold'
                                        : 'bg-zinc-800 hover:bg-emerald-950 text-zinc-300 hover:text-emerald-300'
                                    }`}
                                  >
                                    Force Valid
                                  </button>
                                  <button
                                    type="button"
                                    disabled={overrideLoadingId === playerPayment.id}
                                    onClick={() => handleHostManualOverride(playerPayment.id, 'invalid')}
                                    className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition ${
                                      playerPayment.final_status === 'invalid'
                                        ? 'bg-rose-600 text-white font-bold'
                                        : 'bg-zinc-800 hover:bg-rose-950 text-zinc-300 hover:text-rose-300'
                                    }`}
                                  >
                                    Force Invalid
                                  </button>
                                </div>
                              ) : (
                                <span className="text-zinc-600 text-xs italic">Awaiting upload</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function PollPage(props: PollPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 text-white flex flex-col items-center justify-center p-4">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
          <p className="text-zinc-400 text-sm">Loading...</p>
        </div>
      }
    >
      <PollContent {...props} />
    </Suspense>
  );
}
