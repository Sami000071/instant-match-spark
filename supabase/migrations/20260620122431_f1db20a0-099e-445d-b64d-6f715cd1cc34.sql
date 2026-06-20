CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 40)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.coin_transactions (user_id, delta, reason)
  VALUES (NEW.id, 40, 'signup_bonus');
  RETURN NEW;
END;
$function$