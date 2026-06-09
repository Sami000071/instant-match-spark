GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
GRANT SELECT ON public.coin_transactions TO authenticated;
GRANT ALL ON public.coin_transactions TO service_role;
GRANT SELECT ON public.ad_rewards TO authenticated;
GRANT ALL ON public.ad_rewards TO service_role;

INSERT INTO public.wallets (user_id, balance)
SELECT p.user_id, 50
FROM public.profiles p
WHERE p.user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET balance = CASE
  WHEN public.wallets.balance < 50 THEN 50
  ELSE public.wallets.balance
END,
updated_at = now();

INSERT INTO public.coin_transactions (user_id, delta, reason, metadata)
SELECT p.user_id, 50, 'signup_bonus', '{"source":"backfill"}'::jsonb
FROM public.profiles p
WHERE p.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.coin_transactions ct
    WHERE ct.user_id = p.user_id
      AND ct.reason = 'signup_bonus'
  );