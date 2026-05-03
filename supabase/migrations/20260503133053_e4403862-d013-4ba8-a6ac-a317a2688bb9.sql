-- Mutual friend requests + resulting friendships, keyed by anonymous client_id

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  from_client_id UUID NOT NULL,
  to_client_id UUID NOT NULL,
  from_nickname TEXT NOT NULL DEFAULT '',
  from_avatar_url TEXT NOT NULL DEFAULT '',
  from_country TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, from_client_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friend_requests_no_public_access"
  ON public.friend_requests FOR SELECT USING (false);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON public.friend_requests(to_client_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON public.friend_requests(from_client_id);

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id_a UUID NOT NULL,
  client_id_b UUID NOT NULL,
  nickname_a TEXT NOT NULL DEFAULT '',
  nickname_b TEXT NOT NULL DEFAULT '',
  avatar_a TEXT NOT NULL DEFAULT '',
  avatar_b TEXT NOT NULL DEFAULT '',
  country_a TEXT NOT NULL DEFAULT '',
  country_b TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id_a, client_id_b),
  CHECK (client_id_a < client_id_b)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friendships_select" ON public.friendships FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_friendships_a ON public.friendships(client_id_a);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON public.friendships(client_id_b);
