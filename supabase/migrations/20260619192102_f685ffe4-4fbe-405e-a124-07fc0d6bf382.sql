
REVOKE EXECUTE ON FUNCTION public.current_client_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_session_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_participant(uuid) TO authenticated;
