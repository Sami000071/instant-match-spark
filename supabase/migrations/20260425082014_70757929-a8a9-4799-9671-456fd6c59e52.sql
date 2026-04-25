
-- Queue: users waiting for a match
CREATE TABLE public.queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  interests TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX queue_created_idx ON public.queue (created_at);

-- Match sessions
CREATE TYPE public.session_status AS ENUM ('deciding', 'chatting', 'ended');
CREATE TYPE public.decision AS ENUM ('pending', 'accept', 'skip');

CREATE TABLE public.match_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a_client_id UUID NOT NULL,
  user_a_nickname TEXT NOT NULL,
  user_a_interests TEXT[] NOT NULL DEFAULT '{}',
  user_b_client_id UUID NOT NULL,
  user_b_nickname TEXT NOT NULL,
  user_b_interests TEXT[] NOT NULL DEFAULT '{}',
  user_a_decision public.decision NOT NULL DEFAULT 'pending',
  user_b_decision public.decision NOT NULL DEFAULT 'pending',
  status public.session_status NOT NULL DEFAULT 'deciding',
  decide_deadline TIMESTAMPTZ NOT NULL,
  ended_reason TEXT,
  left_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX match_sessions_a_idx ON public.match_sessions (user_a_client_id);
CREATE INDEX match_sessions_b_idx ON public.match_sessions (user_b_client_id);

-- Messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.match_sessions(id) ON DELETE CASCADE,
  sender_client_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_session_idx ON public.messages (session_id, created_at);

-- Enable RLS
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Anonymous read/write policies (app has no auth; server functions enforce logic)
CREATE POLICY "queue_all" ON public.queue FOR SELECT USING (true);
CREATE POLICY "queue_insert" ON public.queue FOR INSERT WITH CHECK (true);
CREATE POLICY "queue_delete" ON public.queue FOR DELETE USING (true);

CREATE POLICY "sessions_select" ON public.match_sessions FOR SELECT USING (true);
CREATE POLICY "sessions_update" ON public.match_sessions FOR UPDATE USING (true);

CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (true);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

ALTER TABLE public.match_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.queue REPLICA IDENTITY FULL;
