ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.match_sessions ADD COLUMN IF NOT EXISTS user_a_age integer;
ALTER TABLE public.match_sessions ADD COLUMN IF NOT EXISTS user_b_age integer;