-- Add gender + country to profile-bearing tables
ALTER TABLE public.queue
  ADD COLUMN gender text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN country text NOT NULL DEFAULT '';

ALTER TABLE public.match_sessions
  ADD COLUMN user_a_gender text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN user_a_country text NOT NULL DEFAULT '',
  ADD COLUMN user_b_gender text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN user_b_country text NOT NULL DEFAULT '';