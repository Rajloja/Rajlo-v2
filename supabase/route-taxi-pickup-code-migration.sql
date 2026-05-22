-- ─────────────────────────────────────────────────────────────────────
-- Driver-session pickup code
--
-- Every active route taxi session carries a short 4-character code
-- alongside its QR. The QR is the primary path — rider's camera
-- parses `rajlo://route-taxi/session/<uuid>` and POSTs straight to
-- the scan endpoint. The code is the fallback for any rider whose
-- camera is unavailable: they can type 4 chars into the driver's
-- modal entry box and start the trip the same way.
--
-- The code alphabet excludes lookalike characters (I/L/O/0/1) so a
-- rider squinting at a phone screen can't confuse "I" for "1" etc.
-- Uniqueness is enforced only among currently-active sessions via
-- a partial unique index — once a session ends the code is free to
-- recycle.
--
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────

alter table public.driver_sessions
  add column if not exists pickup_code text;

-- Partial unique index — collisions only matter between sessions
-- that could BOTH be claimed right now. Ended/cancelled sessions can
-- share a code with a new active one without ambiguity.
create unique index if not exists driver_sessions_pickup_code_active_idx
  on public.driver_sessions (pickup_code)
  where status = 'active' and pickup_code is not null;
