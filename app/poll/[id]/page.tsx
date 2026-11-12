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
  ThumbsUp,
  DollarSign,
  Upload,
  QrCode,
  Sparkles,
  Award,
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
  type: 'date' | 'time';
  value: string;
  votes_count?: number;
  created_at?: string;
}

interface OptionVote {
  id: string;
  option_id: string;
  poll_id: string | number;
  voter_name: string;
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User state
  const [voterName, setVoterName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);

  // Voting state (Phase 1)
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Phase 2 state
  const [newDateValue, setNewDateValue] = useState('');
  const [newTimeValue, setNewTimeValue] = useState('');
  const [addingOption, setAddingOption] = useState(false);
  const [optionActionId, setOptionActionId] = useState<string | null>(null);
  const [advancingPhase, setAdvancingPhase] = useState(false);

  // Finalisation form state
  const [finalDate, setFinalDate] = useState('');
  const [finalTime, setFinalTime] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [paymentInfo, setPaymentInfo] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [isFinalising, setIsFinalising] = useState(false);
  const [finaliseError, setFinaliseError] = useState<string | null>(null);

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

  // Fetch all poll data
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

      // 3. Fetch Poll Options (Phase 2)
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
      setOptionVotes(optVoteData || []);
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
      .subscribe();

    return () => {
      supabase.removeChannel(pollChannel);
    };
  }, [pollId]);

  // Phase 1: Attendance Vote
  const handleVote = async (coming: boolean) => {
    const trimmedName = voterName.trim();
    if (!trimmedName) {
      setFeedbackMsg({ type: 'error', text: 'Please enter your name to vote.' });
      return;
    }

    setVoteSubmitting(true);
    setFeedbackMsg(null);

    try {
      if (typeof window !== 'undefined') {
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

  // Add Date Option (Phase 2)
  const handleAddDateOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDateValue.trim()) return;

    setAddingOption(true);
    try {
      const { error } = await supabase.from('poll_options').insert([
        {
          poll_id: pollId,
          type: 'date',
          value: newDateValue.trim(),
        },
      ]);
      if (error) throw error;
      setNewDateValue('');
      await fetchPollData();
    } catch (err: any) {
      console.error('Error adding date option:', err);
      alert('Failed to add date option: ' + err.message);
    } finally {
      setAddingOption(false);
    }
  };

  // Add Time Option (Phase 2)
  const handleAddTimeOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTimeValue.trim()) return;

    setAddingOption(true);
    try {
      const { error } = await supabase.from('poll_options').insert([
        {
          poll_id: pollId,
          type: 'time',
          value: newTimeValue.trim(),
        },
      ]);
      if (error) throw error;
      setNewTimeValue('');
      await fetchPollData();
    } catch (err: any) {
      console.error('Error adding time option:', err);
      alert('Failed to add time option: ' + err.message);
    } finally {
      setAddingOption(false);
    }
  };

  // Vote on an Option (Phase 2)
  const handleVoteOnOption = async (optionId: string) => {
    const trimmedName = voterName.trim();
    if (!trimmedName) {
      alert('Please enter your name first in the header or attendance section.');
      return;
    }

    setOptionActionId(optionId);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('turf_voter_name', trimmedName);
      }

      // Check if user already voted on this option
      const existing = optionVotes.find(
        (ov) => ov.option_id === optionId && ov.voter_name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (existing) {
        // Toggle OFF vote
        await supabase.from('option_votes').delete().eq('id', existing.id);
      } else {
        // Toggle ON vote
        await supabase.from('option_votes').insert([
          {
            option_id: optionId,
            poll_id: pollId,
            voter_name: trimmedName,
          },
        ]);
      }

      await fetchPollData();
    } catch (err: any) {
      console.error('Error voting on option:', err);
    } finally {
      setOptionActionId(null);
    }
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

      // Optional QR upload to 'screenshots' bucket
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

  // Group options by type
  const dateOptions = options.filter((o) => o.type === 'date');
  const timeOptions = options.filter((o) => o.type === 'time');

  // Count helper
  const getVotesForOption = (optionId: string) => {
    return optionVotes.filter((ov) => ov.option_id === optionId);
  };
  const hasUserVotedOption = (optionId: string) => {
    return optionVotes.some(
      (ov) => ov.option_id === optionId && ov.voter_name.toLowerCase() === voterName.trim().toLowerCase()
    );
  };

  // Cost split calculation for finalised view
  const confirmedPlayersCount = comingList.length > 0 ? comingList.length : 1;
  const costPerPerson = poll?.total_cost ? Math.ceil(poll.total_cost / confirmedPlayersCount) : 0;

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
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
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
              {poll.status === 'poll_2' && 'Phase 2: Date & Time Voting'}
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

            {/* Pre-seeded Turf Quick Action Buttons */}
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
            <span>Voting as:</span>
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
          <span className="text-zinc-500 text-xs">Used for your attendance & slot votes</span>
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

            {/* Advance Phase Button (Host Only in poll_1) */}
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

          {/* Voting Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={voteSubmitting}
              onClick={() => handleVote(true)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/30"
            >
              <CheckCircle2 className="w-4 h-4" />
              Yes, I&apos;m in!
            </button>

            <button
              type="button"
              disabled={voteSubmitting}
              onClick={() => handleVote(false)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-200 hover:border-rose-500/40 border border-zinc-700 text-zinc-300 active:scale-[0.99] font-semibold text-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
        {/* PHASE 2: Date & Time Voting (Available in 'poll_2' or 'finalised') */}
        {/* ========================================================================= */}
        {(poll.status === 'poll_2' || poll.status === 'finalised') && (
          <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  Date & Time Options
                </h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Suggest preferred match dates & time slots, then vote on your favorites.
                </p>
              </div>
              {poll.status === 'poll_2' && isHost && (
                <div className="text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                  ⚡ As Host, pick the final winner below when ready!
                </div>
              )}
            </div>

            {/* SECTION A: Dates */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Date Options
              </h3>

              {/* Add Date Form */}
              {poll.status !== 'finalised' && (
                <form onSubmit={handleAddDateOption} className="flex gap-2">
                  <input
                    type="text"
                    value={newDateValue}
                    onChange={(e) => setNewDateValue(e.target.value)}
                    placeholder='Suggest a date, e.g. "Sat, 15 Nov" or "Sun, 16 Nov"'
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 text-white placeholder-zinc-500 text-xs sm:text-sm outline-none focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={addingOption || !newDateValue.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </form>
              )}

              {/* Dates list */}
              {dateOptions.length === 0 ? (
                <p className="text-zinc-600 text-xs italic">No date options proposed yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {dateOptions.map((opt) => {
                    const optVoters = getVotesForOption(opt.id);
                    const voted = hasUserVotedOption(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                          voted
                            ? 'bg-emerald-950/40 border-emerald-500/50'
                            : 'bg-zinc-950/50 border-zinc-800'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-sm text-zinc-100">{opt.value}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            {optVoters.length} vote{optVoters.length === 1 ? '' : 's'}
                            {optVoters.length > 0 && ` (${optVoters.map((v) => v.voter_name).join(', ')})`}
                          </div>
                        </div>

                        {poll.status !== 'finalised' && (
                          <button
                            type="button"
                            onClick={() => handleVoteOnOption(opt.id)}
                            disabled={optionActionId === opt.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                              voted
                                ? 'bg-emerald-500 text-zinc-950'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            {voted ? 'Voted' : 'Vote'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION B: Times */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Time Slot Options
              </h3>

              {/* Add Time Form */}
              {poll.status !== 'finalised' && (
                <form onSubmit={handleAddTimeOption} className="flex gap-2">
                  <input
                    type="text"
                    value={newTimeValue}
                    onChange={(e) => setNewTimeValue(e.target.value)}
                    placeholder='Suggest a time slot, e.g. "7:00 PM - 8:00 PM"'
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 text-white placeholder-zinc-500 text-xs sm:text-sm outline-none focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={addingOption || !newTimeValue.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </form>
              )}

              {/* Times list */}
              {timeOptions.length === 0 ? (
                <p className="text-zinc-600 text-xs italic">No time slot options proposed yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {timeOptions.map((opt) => {
                    const optVoters = getVotesForOption(opt.id);
                    const voted = hasUserVotedOption(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                          voted
                            ? 'bg-emerald-950/40 border-emerald-500/50'
                            : 'bg-zinc-950/50 border-zinc-800'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-sm text-zinc-100">{opt.value}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            {optVoters.length} vote{optVoters.length === 1 ? '' : 's'}
                            {optVoters.length > 0 && ` (${optVoters.map((v) => v.voter_name).join(', ')})`}
                          </div>
                        </div>

                        {poll.status !== 'finalised' && (
                          <button
                            type="button"
                            onClick={() => handleVoteOnOption(opt.id)}
                            disabled={optionActionId === opt.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                              voted
                                ? 'bg-emerald-500 text-zinc-950'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            {voted ? 'Voted' : 'Vote'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* HOST FINALISATION & VENUE BOOKING HUB (Host Only in Phase 2) */}
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

            {/* Venue Calling Banner */}
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

            {/* Finalisation Form */}
            <form onSubmit={handleFinalisePoll} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Final Date */}
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
                  {dateOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[10px] text-zinc-500">Suggested:</span>
                      {dateOptions.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setFinalDate(o.value)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          {o.value}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Final Time */}
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
                    placeholder="e.g. 8:00 PM - 9:00 PM"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700 focus:border-emerald-400 text-white text-xs sm:text-sm outline-none"
                  />
                  {timeOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[10px] text-zinc-500">Suggested:</span>
                      {timeOptions.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setFinalTime(o.value)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          {o.value}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Total Turf Cost */}
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

                {/* Host Payment Info / UPI ID */}
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

              {/* Upload QR Image (Optional) */}
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

              {/* Submit Finalise Button */}
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
        {/* FINALISED VIEW: Payment & Split Dashboard */}
        {/* ========================================================================= */}
        {poll.status === 'finalised' && (
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

            {/* Match Summary Grid */}
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

            {/* Payment Details Section */}
            <div className="p-5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-4">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-400" />
                How to Pay the Host ({poll.host_name})
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
                  <div className="text-xs text-zinc-400">UPI ID / Payment Info:</div>
                  <div className="text-base font-bold text-emerald-300 font-mono bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 inline-block">
                    {poll.payment_info || 'Ask host directly for payment details'}
                  </div>
                  <p className="text-xs text-zinc-400 max-w-sm">
                    Please pay <strong>₹{costPerPerson}</strong> to the host promptly so the slot reservation remains confirmed.
                  </p>
                </div>
              </div>
            </div>
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
