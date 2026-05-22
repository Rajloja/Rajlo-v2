-- ─────────────────────────────────────────────────────────────────────
-- Predictive transfer broadcast
--
-- Multi-leg route taxi journeys need to notify the NEXT leg's
-- candidate drivers a few minutes BEFORE the rider arrives at the
-- transfer point — not at the moment the current leg completes.
-- The trigger fires from the driver-position endpoint when the
-- current leg's driver is within a short distance of the dropoff
-- AND the system hasn't already pre-broadcast the next leg.
--
-- We store the dedupe timestamp on the CURRENT leg's row
-- (`transfer_broadcast_at`) so a chatty GPS that fires every 15s
-- only triggers the broadcast once per leg.
--
-- Idempotent. Backfill is a no-op — pre-existing rows simply have
-- the column NULL.
-- ─────────────────────────────────────────────────────────────────────

alter table public.route_hails
  add column if not exists transfer_broadcast_at timestamptz;
