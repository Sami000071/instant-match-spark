
-- Helper: current user's client_id from profiles
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Helper: is current user a participant of a match session
CREATE OR REPLACE FUNCTION public.is_session_participant(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.match_sessions s
    WHERE s.id = _session_id
      AND (s.user_a_client_id = public.current_client_id()
        OR s.user_b_client_id = public.current_client_id())
  )
$$;

-- profiles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Profiles readable by all" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- match_sessions: only participants
DROP POLICY IF EXISTS sessions_select ON public.match_sessions;
CREATE POLICY sessions_select_participants
  ON public.match_sessions FOR SELECT
  TO authenticated
  USING (
    user_a_client_id = public.current_client_id()
    OR user_b_client_id = public.current_client_id()
  );

-- messages: only session participants
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select_participants
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_session_participant(session_id));

-- friend_messages: only sender or recipient
DROP POLICY IF EXISTS friend_messages_select ON public.friend_messages;
CREATE POLICY friend_messages_select_participants
  ON public.friend_messages FOR SELECT
  TO authenticated
  USING (
    from_client_id = public.current_client_id()
    OR to_client_id = public.current_client_id()
  );

-- blocks: only blocker or blocked
DROP POLICY IF EXISTS blocks_select ON public.blocks;
CREATE POLICY blocks_select_owner
  ON public.blocks FOR SELECT
  TO authenticated
  USING (
    blocker_client_id = public.current_client_id()
    OR blocked_client_id = public.current_client_id()
  );

-- friendships: only the two involved users
DROP POLICY IF EXISTS friendships_select ON public.friendships;
CREATE POLICY friendships_select_participants
  ON public.friendships FOR SELECT
  TO authenticated
  USING (
    client_id_a = public.current_client_id()
    OR client_id_b = public.current_client_id()
  );

-- queue: only own row
DROP POLICY IF EXISTS queue_all ON public.queue;
CREATE POLICY queue_select_own
  ON public.queue FOR SELECT
  TO authenticated
  USING (client_id = public.current_client_id());

-- Storage avatars: lock down INSERT/UPDATE (uploads go through server signed URLs)
DROP POLICY IF EXISTS avatars_public_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_public_update ON storage.objects;
CREATE POLICY avatars_no_direct_insert
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY avatars_no_direct_update
  ON storage.objects FOR UPDATE
  TO authenticated, anon
  USING (false);

-- Realtime: require authentication to subscribe to broadcast/presence channels
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS realtime_authenticated_only ON realtime.messages;
CREATE POLICY realtime_authenticated_only
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (true);
