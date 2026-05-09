-- Profiles table linked to auth.users
CREATE TABLE public.profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  nickname TEXT NOT NULL DEFAULT '',
  age INTEGER,
  country TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'unspecified',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profile basics (used by matchmaking/friends UI)
CREATE POLICY "Profiles readable by all"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Age must be 18+
CREATE OR REPLACE FUNCTION public.profiles_validate_age()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.age IS NOT NULL AND NEW.age < 18 THEN
    RAISE EXCEPTION 'You must be 18 or older to use this app';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_validate_age_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_age();

-- Auto-create empty profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();