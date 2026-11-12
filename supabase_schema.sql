-- SQL Schema for Turf Booking App (Phase 1 + Phase 2 WhatsApp Poll + Phase 3)

-- 1. Create polls table
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_name TEXT NOT NULL,
    turf_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'poll_1', -- 'poll_1', 'poll_2', 'finalised'
    host_secret_token TEXT NOT NULL,
    final_date TEXT,
    final_time TEXT,
    total_cost NUMERIC,
    payment_info TEXT, -- phone number or UPI ID
    qr_code_url TEXT, -- URL in screenshots storage bucket
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create votes table (Phase 1 Attendance)
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    voter_name TEXT NOT NULL,
    coming BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT votes_poll_id_voter_name_key UNIQUE (poll_id, voter_name)
);

-- 3. Create poll_options table (Phase 2 WhatsApp-style Combined Date & Time Options)
-- Supports both 'option_text' and 'value' for seamless backwards compatibility
CREATE TABLE IF NOT EXISTS public.poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_text TEXT, -- e.g. "Sat 15 Nov, 7:00 PM - 8:00 PM"
    value TEXT,       -- backwards compatibility alias
    type TEXT DEFAULT 'combined',
    votes_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Add column if table already exists without option_text
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poll_options' AND column_name='option_text') THEN
        ALTER TABLE public.poll_options ADD COLUMN option_text TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poll_options' AND column_name='value') THEN
        ALTER TABLE public.poll_options ADD COLUMN value TEXT;
    END IF;
END $$;

-- 4. Create option_votes table (Phase 2 votes on options - multiple selections supported)
CREATE TABLE IF NOT EXISTS public.option_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    voter_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT option_votes_option_id_voter_name_key UNIQUE (option_id, voter_name)
);

-- 5. Create payments table (Phase 3 Payments & Gemini Verification)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    amount_paid NUMERIC NOT NULL DEFAULT 0,
    expected_amount NUMERIC NOT NULL DEFAULT 0,
    screenshot_url TEXT NOT NULL,
    transaction_id TEXT,
    receiver_name_or_upi TEXT,
    gemini_verdict TEXT NOT NULL DEFAULT 'suspicious', -- 'valid', 'suspicious', 'invalid'
    final_status TEXT NOT NULL DEFAULT 'pending', -- 'valid', 'invalid', 'pending'
    reasons JSONB DEFAULT '[]'::jsonb,
    is_manual_override BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 7. Policies for public access (anon key)
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

CREATE POLICY "Allow public read access to poll_options"
    ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "Allow public insert and update to poll_options"
    ON public.poll_options FOR ALL USING (true);

CREATE POLICY "Allow public read access to option_votes"
    ON public.option_votes FOR SELECT USING (true);
CREATE POLICY "Allow public insert and delete to option_votes"
    ON public.option_votes FOR ALL USING (true);

CREATE POLICY "Allow public read access to payments"
    ON public.payments FOR SELECT USING (true);
CREATE POLICY "Allow public insert and update to payments"
    ON public.payments FOR ALL USING (true);

-- 8. Realtime publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.option_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
