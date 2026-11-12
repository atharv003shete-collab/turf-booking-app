'use client';

import { useEffect, useState, use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
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
} from 'lucide-react';

interface Poll {
  id: string | number;
  host_name: string;
  turf_name: string;
  status: string;
  created_at?: string;
  host_secret_token?: string;
}

interface Vote {
  id?: string | number;
  poll_id: string | number;
  voter_name: string;
  coming: boolean;
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Voting form state
  const [voterName, setVoterName] = useState('');
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Load existing voter name from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('turf_voter_name');
      if (savedName) setVoterName(savedName);
    }
  }, []);

  // Fetch poll details & votes
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

      // 2. Fetch Votes
      const { data: voteData, error: voteError } = await supabase
        .from('votes')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: false });

      if (voteError) throw voteError;
      setVotes(voteData || []);
    } catch (err: any) {
      console.error('Error fetching poll data:', err);
      setErrorMsg(err.message || 'Could not load poll details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPollData();

    // Set up Supabase Realtime subscription for votes so voter list updates live
    const channel = supabase
      .channel(`public:votes:${pollId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `poll_id=eq.${pollId}` },
        () => {
          fetchPollData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pollId]);

  // Handle Voting
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

      // Upsert into votes table to handle UNIQUE(poll_id, voter_name) constraint gracefully
      const { error } = await supabase
        .from('votes')
        .upsert(
          {
            poll_id: pollId,
            voter_name: trimmedName,
            coming: coming,
          },
          {
            onConflict: 'poll_id,voter_name',
          }
        );

      if (error) throw error;

      setFeedbackMsg({
        type: 'success',
        text: coming ? `Great! You voted: "Yes, I'm in!"` : `Recorded: "Not coming".`,
      });

      // Refetch votes
      await fetchPollData();
    } catch (err: any) {
      console.error('Error submitting vote:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to submit your vote. Please try again.',
      });
    } finally {
      setVoteSubmitting(false);
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

  const comingList = votes.filter((v) => v.coming);
  const notComingList = votes.filter((v) => !v.coming);

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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation & Share */}
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

        {/* Host Banner if viewing as Host */}
        {isHostQuery && (
          <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>You are viewing this poll as the <strong>Host</strong> ({poll.host_name}). Share this page link with your group!</span>
          </div>
        )}

        {/* Poll Header Card */}
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider">
              Phase: {poll.status} (Attendance)
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

          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <User className="w-4 h-4 text-emerald-400" />
            <span>Hosted by <strong className="text-zinc-200">{poll.host_name}</strong></span>
          </div>
        </div>

        {/* "Are you coming?" Voting Card */}
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg sm:text-xl font-bold text-white">Are you coming?</h2>
          </div>
          <p className="text-zinc-400 text-xs sm:text-sm mb-6">
            Enter your name below and cast your vote. You can always change your vote later with the same name.
          </p>

          {feedbackMsg && (
            <div
              className={`mb-6 p-3.5 rounded-xl text-xs sm:text-sm border ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/60 border-red-500/40 text-red-300'
              }`}
            >
              {feedbackMsg.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="voterNameInput" className="block text-xs sm:text-sm font-medium text-zinc-300 mb-1.5">
                Your Name
              </label>
              <input
                id="voterNameInput"
                type="text"
                value={voterName}
                onChange={(e) => setVoterName(e.target.value)}
                placeholder="Enter your name or nickname..."
                className="w-full px-4 py-3 rounded-xl bg-zinc-950/80 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-white placeholder-zinc-500 text-sm outline-none transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
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
          </div>
        </div>

        {/* Live Attendance List */}
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Live Attendance ({votes.length} voted)
            </h3>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="text-emerald-400 bg-emerald-950/50 px-2 py-1 rounded-md border border-emerald-500/20">
                In: {comingList.length}
              </span>
              <span className="text-rose-400 bg-rose-950/50 px-2 py-1 rounded-md border border-rose-500/20">
                Out: {notComingList.length}
              </span>
            </div>
          </div>

          {votes.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">
              No votes yet. Be the first player to cast your response!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Coming List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Playing ({comingList.length})
                </div>
                {comingList.length === 0 ? (
                  <p className="text-zinc-600 text-xs italic">No confirmations yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {comingList.map((vote) => (
                      <div
                        key={vote.id || `${vote.poll_id}-${vote.voter_name}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs sm:text-sm text-zinc-200"
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

              {/* Not Coming List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <XCircle className="w-3.5 h-3.5" />
                  Not Coming ({notComingList.length})
                </div>
                {notComingList.length === 0 ? (
                  <p className="text-zinc-600 text-xs italic">Nobody declined yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {notComingList.map((vote) => (
                      <div
                        key={vote.id || `${vote.poll_id}-${vote.voter_name}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-950/40 border border-zinc-800 text-xs sm:text-sm text-zinc-400"
                      >
                        <span>{vote.voter_name}</span>
                        <span className="text-rose-400/80 text-xs">Out</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
