-- Rajlo — account-level deactivation flag on profiles.
--
-- Deactivation already BANS the Supabase auth user (blocks new
-- sessions), but a user who is *presently logged in* keeps a valid
-- access token for up to ~1h, so their in-flight requests still
-- succeed and the ban isn't visible to them — they just eventually
-- get bounced to a login page with a confusing "link expired" error.
--
-- This column gives every authenticated request (and the /api/me/status
-- poll behind the DeactivatedGate) a cheap, role-agnostic way to detect
-- "this account was deactivated" and show the proper
-- "Account deactivated — contact support" screen instead.
--
-- Drivers already carry `drivers.deactivated_at`; this mirrors it at the
-- profile level so riders + admins are covered by the same mechanism.
--
-- Stamped `= now()` by the deactivate API, cleared `= null` on
-- reactivation. Idempotent — safe to re-run.
alter table public.profiles
  add column if not exists deactivated_at timestamptz;
