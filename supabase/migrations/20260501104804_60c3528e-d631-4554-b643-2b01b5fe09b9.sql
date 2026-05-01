-- Drop interests columns (no longer used)
ALTER TABLE public.queue DROP COLUMN IF EXISTS interests;
ALTER TABLE public.match_sessions DROP COLUMN IF EXISTS user_a_interests;
ALTER TABLE public.match_sessions DROP COLUMN IF EXISTS user_b_interests;

-- Add avatar_url to queue and sessions
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '';
ALTER TABLE public.match_sessions ADD COLUMN IF NOT EXISTS user_a_avatar_url text NOT NULL DEFAULT '';
ALTER TABLE public.match_sessions ADD COLUMN IF NOT EXISTS user_b_avatar_url text NOT NULL DEFAULT '';

-- Blocks table: blocker_client_id never wants to be matched with blocked_client_id again.
CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_client_id uuid NOT NULL,
  blocked_client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_client_id, blocked_client_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON public.blocks(blocker_client_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON public.blocks(blocked_client_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_select" ON public.blocks FOR SELECT USING (true);

-- Reports table: flag a partner for abuse. Server-only writes.
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid,
  reporter_client_id uuid NOT NULL,
  reported_client_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_reported_idx ON public.reports(reported_client_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
-- No public policies: only service role can read/write reports.

-- Helpful indexes for matchmaking + reconnect lookups
CREATE INDEX IF NOT EXISTS match_sessions_user_a_idx ON public.match_sessions(user_a_client_id);
CREATE INDEX IF NOT EXISTS match_sessions_user_b_idx ON public.match_sessions(user_b_client_id);
CREATE INDEX IF NOT EXISTS match_sessions_status_idx ON public.match_sessions(status);
CREATE INDEX IF NOT EXISTS queue_client_idx ON public.queue(client_id);

-- Avatars storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public can read avatar files
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Anyone can upload to avatars (size limited via app); files keyed by client id
DROP POLICY IF EXISTS "avatars_public_insert" ON storage.objects;
CREATE POLICY "avatars_public_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_public_update" ON storage.objects;
CREATE POLICY "avatars_public_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars');