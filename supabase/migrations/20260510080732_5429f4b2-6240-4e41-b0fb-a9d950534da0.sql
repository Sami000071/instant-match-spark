
-- Wallet table
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY,
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_owner_select" ON public.wallets FOR SELECT USING (auth.uid() = user_id);

-- Transaction log
CREATE TABLE public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_owner_select" ON public.coin_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX coin_tx_user_created_idx ON public.coin_transactions (user_id, created_at DESC);

-- Ad reward log (for cooldown / daily cap)
CREATE TABLE public.ad_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_owner_select" ON public.ad_rewards FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX ad_rewards_user_created_idx ON public.ad_rewards (user_id, created_at DESC);

-- Lobby column for premium matchmaking
ALTER TABLE public.queue ADD COLUMN lobby TEXT NOT NULL DEFAULT 'any';
ALTER TABLE public.match_sessions ADD COLUMN lobby TEXT NOT NULL DEFAULT 'any';

-- Atomic credit
CREATE OR REPLACE FUNCTION public.credit_coins(_user_id UUID, _amount INT, _reason TEXT, _meta JSONB DEFAULT '{}'::jsonb)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INT;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.wallets (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = wallets.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO new_balance;
  INSERT INTO public.coin_transactions (user_id, delta, reason, metadata)
  VALUES (_user_id, _amount, _reason, COALESCE(_meta, '{}'::jsonb));
  RETURN new_balance;
END;
$$;

-- Atomic spend (errors if insufficient funds)
CREATE OR REPLACE FUNCTION public.spend_coins(_user_id UUID, _amount INT, _reason TEXT, _meta JSONB DEFAULT '{}'::jsonb)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance INT;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.wallets (user_id, balance) VALUES (_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets
    SET balance = balance - _amount, updated_at = now()
    WHERE user_id = _user_id AND balance >= _amount
  RETURNING balance INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;
  INSERT INTO public.coin_transactions (user_id, delta, reason, metadata)
  VALUES (_user_id, -_amount, _reason, COALESCE(_meta, '{}'::jsonb));
  RETURN new_balance;
END;
$$;

-- Update new-user trigger to also award signup bonus and create wallet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 50)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_transactions (user_id, delta, reason)
  VALUES (NEW.id, 50, 'signup_bonus');
  RETURN NEW;
END;
$$;

-- Make sure trigger exists on auth.users (safe re-create)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
