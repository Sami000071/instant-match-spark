CREATE TABLE public.friend_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_key text NOT NULL,
  from_client_id uuid NOT NULL,
  to_client_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_friend_messages_pair ON public.friend_messages (pair_key, created_at);

ALTER TABLE public.friend_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friend_messages_select" ON public.friend_messages
FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_messages;