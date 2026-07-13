-- ============================================================================
-- Rajlo — Employer role migration
--
-- Adds an "employer" role — a Rajlo staff account (field agent, taxi-
-- hub rep) who onboards drivers on their behalf. Employers sit with
-- real drivers at a taxi hub, fill out the driver's onboarding form
-- for them (all fields + doc uploads + payout method, EXCEPT the
-- password), and submit. From that moment:
--
--   1. The driver row lands in the admin verification queue exactly
--      like a self-onboarded driver would.
--   2. The driver receives a Rajlo-branded email with a link to
--      /auth/set-password?token=... which lets them create their own
--      password. The token has no user-facing expiry (365 days
--      server-side, consume-once, admin-regeneratable).
--   3. Admin approves docs → driver can log in and start operating.
--
-- The `onboarded_by_employer_id` on drivers is the link back to the
-- employer who did the onboarding. Employers see only their own
-- onboarded drivers (RLS via that column). Admins see everything with
-- an "Onboarded by <employer>" attribution on the verification detail
-- page.
--
-- Idempotent. Run once against staging, verify, then production.
-- ============================================================================


-- ─── 1. Widen profiles.role check constraint to include 'employer' ───
-- Prior enum: rider / driver / admin / safety_officer. Adding 'employer'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('rider', 'driver', 'admin', 'safety_officer', 'employer'));
END $$;


-- ─── 2. drivers.onboarded_by_employer_id ───
-- Nullable — every driver who onboarded themselves prior to this
-- feature has NULL here. Populated on employer submission. ON DELETE
-- SET NULL because if an employer's account is later deleted, we
-- still want the driver row + audit trail to survive.
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS onboarded_by_employer_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS drivers_onboarded_by_idx
  ON public.drivers(onboarded_by_employer_id)
  WHERE onboarded_by_employer_id IS NOT NULL;


-- ─── 3. driver_password_setup_tokens ───
-- One row per issued setup link. Consume-once semantics — the
-- `consumed_at` timestamp gates whether the token is still valid.
-- No exp column: we enforce "365 days" in server code, not the DB,
-- because the spec calls for admin-regeneratable links and enforcing
-- expiry per-row would complicate resend UX. Server checks
-- `created_at + 365 days > now()` at validation time.
CREATE TABLE IF NOT EXISTS public.driver_password_setup_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by_employer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_ip text,
  -- On regenerate we mark the old one 'superseded' and issue a new
  -- token — the old token can't then be used even before "expiry".
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.driver_password_setup_tokens(token)
);

CREATE INDEX IF NOT EXISTS driver_password_setup_tokens_driver_idx
  ON public.driver_password_setup_tokens(driver_user_id);

-- Only ONE active (unused, un-superseded) token per driver at a time.
-- Regeneration flips the old one to superseded and inserts a new row.
CREATE UNIQUE INDEX IF NOT EXISTS driver_password_setup_tokens_one_active
  ON public.driver_password_setup_tokens(driver_user_id)
  WHERE consumed_at IS NULL AND superseded_at IS NULL;

ALTER TABLE public.driver_password_setup_tokens ENABLE ROW LEVEL SECURITY;
-- No policies — every read/write goes through the service_role client
-- in the /api/auth/set-password and /api/admin/employers endpoints.


-- ─── 4. drivers RLS: employers can see their own onboarded drivers ───
-- Existing drivers policy set is admin + service_role only for reads
-- from the app side (the API endpoints route through service_role for
-- admin surfaces). We add a per-employer read policy so the employer
-- portal can list "drivers I onboarded" via the anon-key client if we
-- ever wire it that way. Currently the employer API uses service_role,
-- but the policy is here defensively — belt and suspenders.
DROP POLICY IF EXISTS "Employers can read own onboarded drivers" ON public.drivers;
CREATE POLICY "Employers can read own onboarded drivers"
ON public.drivers FOR SELECT
TO authenticated
USING (
  onboarded_by_employer_id = auth.uid()
);


-- ─── 5. Storage RLS: employer-drafts subtree in driver-documents ───
-- Employers need to upload doc files BEFORE the target driver's
-- auth.user id exists (files first, driver row created at submit time).
-- We give them a scoped subtree of the driver-documents bucket:
--
--   driver-documents/employer-drafts/<employer_user_id>/<session_uuid>/<docKey>
--
-- On submit, the server (service_role) copies each file to the newly-
-- created driver's own folder (matching the existing convention) and
-- removes the original. Cleanup cron purges orphaned drafts older than
-- 24 h.
--
-- The path-scope RLS uses storage.foldername(name)[2] to isolate one
-- employer's uploads from another's — the first path segment is
-- "employer-drafts" (literal), the second is the employer's user id.

DROP POLICY IF EXISTS "Employers can upload draft documents" ON storage.objects;
CREATE POLICY "Employers can upload draft documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = 'employer-drafts'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'employer'
  )
);

DROP POLICY IF EXISTS "Employers can read own draft documents" ON storage.objects;
CREATE POLICY "Employers can read own draft documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = 'employer-drafts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "Employers can delete own draft documents" ON storage.objects;
CREATE POLICY "Employers can delete own draft documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND (storage.foldername(name))[1] = 'employer-drafts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);


-- ─── 6. driver_password_setup_tokens cleanup helper ───
-- Convenience function — admin can regenerate a token by calling this
-- from a route with service_role, avoiding a round-trip.
CREATE OR REPLACE FUNCTION public.supersede_driver_password_token(p_driver_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.driver_password_setup_tokens
     SET superseded_at = now()
   WHERE driver_user_id = p_driver_user_id
     AND consumed_at IS NULL
     AND superseded_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.supersede_driver_password_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supersede_driver_password_token(uuid) TO service_role;
