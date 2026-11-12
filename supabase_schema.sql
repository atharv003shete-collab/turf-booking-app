-- SQL Schema for Turf Booking App

-- 1. Create polls table
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_name TEXT NOT NULL,
    turf_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'poll_1',
    host_secret_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create votes table
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    voter_name TEXT NOT NULL,
    coming BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT votes_poll_id_voter_name_key UNIQUE (poll_id, voter_name)
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- 4. Policies for public access (or anon key)
CREATE POLICY "Allow public read access to polls"
    ON public.polls FOR SELECT USING (true);

CREATE POLICY "Allow public insert to polls"
    ON public.polls FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update to polls"
    ON public.polls FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to votes"
    ON public.votes FOR SELECT USING (true);

CREATE POLICY "Allow public insert and update to votes"
    ON public.votes FOR ALL USING (true);

-- 5. Enable Supabase Realtime for votes table
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
