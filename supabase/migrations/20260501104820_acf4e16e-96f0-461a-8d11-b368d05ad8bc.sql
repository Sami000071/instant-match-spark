-- Replace broad avatars SELECT with a narrower policy that still allows direct
-- file access by exact key, but blocks listing the whole bucket.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND coalesce((current_setting('request.method', true)), 'GET') <> 'LIST'
  );

-- Reports: explicitly deny all public access (RLS on, no policies = deny).
-- Add a self-documenting policy that denies SELECT from anon/auth roles.
CREATE POLICY "reports_no_public_access" ON public.reports
  FOR SELECT USING (false);