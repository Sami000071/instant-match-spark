
REVOKE EXECUTE ON FUNCTION public.spend_coins(UUID, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_coins(UUID, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
