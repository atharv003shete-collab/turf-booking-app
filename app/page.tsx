'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { TURF_LOCATIONS } from '@/lib/turfs';
import { Trophy, MapPin, User, Sparkles, ArrowRight, Share2, Copy, Check } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [selectedTurf, setSelectedTurf] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdPoll, setCreatedPoll] = useState<{ id: string | number; hostToken: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const generateHostSecretToken = () => {
    return 'host_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName.trim() || !selectedTurf) {
      setErrorMsg('Please enter your name and choose a turf.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const hostSecretToken = generateHostSecretToken();
      const { data, error } = await supabase
        .from('polls')
        .insert([
          {
            host_name: hostName.trim(),
            turf_name: selectedTurf,
            status: 'poll_1',
            host_secret_token: hostSecretToken,
          },
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data && data.id) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`poll_${data.id}_host_token`, hostSecretToken);
        }
        setCreatedPoll({ id: data.id, hostToken: hostSecretToken });
        router.push(`/poll/${data.id}?host=true`);
      }
    } catch (err: any) {
      console.error('Error creating poll:', err);
      setErrorMsg(err.message || 'Failed to create poll. Please verify your Supabase configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareUrl = createdPoll && typeof window !== 'undefined'
    ? `${window.location.origin}/poll/${createdPoll.id}`
    : '';

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 text-zinc-100 flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-3xl mx-auto w-full pt-6 pb-12">
        {/* Header Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs sm:text-sm font-medium">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Field Turf Match & Booking Coordinator</span>
          </div>
        </div>

        {/* Hero Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-3">
            Plan Your Next <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Turf Game</span>
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto">
            Choose your favourite arena in Dombivli or Palava, start an attendance poll, and easily gather your squad.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-emerald-950/40">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleCreatePoll} className="space-y-6">
            {/* Host Name Field */}
            <div>
              <label htmlFor="hostName" className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                Host Name
              </label>
              <input
                id="hostName"
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="e.g. Atharv Shete"
                required
                className="w-full px-4 py-3 rounded-xl bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-white placeholder-zinc-500 text-sm transition outline-none"
              />
            </div>

            {/* Turf Dropdown Field */}
            <div>
              <label htmlFor="turfSelect" className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Select Turf Location & Arena
              </label>
              <div className="relative">
                <select
                  id="turfSelect"
                  value={selectedTurf}
                  onChange={(e) => setSelectedTurf(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-zinc-950/70 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-white text-sm transition outline-none appearance-none cursor-pointer"
                >
                  <option value="" disabled className="text-zinc-600 bg-zinc-900">
                    -- Choose an arena from the list --
                  </option>
                  {TURF_LOCATIONS.map((group) => (
                    <optgroup key={group.location} label={`📍 ${group.location}`} className="bg-zinc-900 font-semibold text-emerald-400">
                      {group.turfs.map((turf) => (
                        <option key={turf.name} value={turf.name} className="text-zinc-200 bg-zinc-950 font-normal">
                          {turf.name} ({turf.phone})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-400">
                  <ArrowRight className="w-4 h-4 rotate-90 text-zinc-400" />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.99] text-zinc-950 font-semibold text-sm transition duration-200 shadow-lg shadow-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  Creating Poll...
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4" />
                  Create Attendance Poll (Phase 1)
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Share Link Section if already created */}
          {createdPoll && (
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <Share2 className="w-3.5 h-3.5" />
                    Shareable Voter Link
                  </span>
                  {copied && <span className="text-xs text-emerald-300">Copied to clipboard!</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="w-full bg-zinc-950/80 text-zinc-300 text-xs px-3 py-2 rounded-lg border border-zinc-700/60 outline-none"
                  />
                  <button
                    onClick={copyShareLink}
                    type="button"
                    className="px-3 py-2 rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-medium text-xs flex items-center gap-1 cursor-pointer transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-zinc-500 py-4">
        Turf Booking App • Dombivli & Palava Sports Community
      </footer>
    </main>
  );
}
