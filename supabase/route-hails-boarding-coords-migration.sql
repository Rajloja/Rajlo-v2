-- ─────────────────────────────────────────────────────────────────────
-- Route taxi mid-corridor boarding / alighting coords
--
-- The pathfinder now snaps a rider's pickup / dropoff onto a corridor
-- ROAD LINE (not just its named endpoints). The projection point —
-- where the rider physically stands to flag down the taxi — needs to
-- be persisted so the driver's nav target lands at the exact same
-- spot the rider sees on their map.
--
-- We keep `pickup_lat/lng` and `dropoff_lat/lng` as the RIDER'S TYPED
-- pickup / dropoff (the "original ask"), and add new
-- `boarding_lat/lng` and `alighting_lat/lng` for the mid-corridor
-- projection. Reads always fall back to the typed pickup when the
-- projection is null (e.g. for legacy hails or single-corridor hails
-- created before this column existed).
--
-- Idempotent. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

alter table public.route_hails
  add column if not exists boarding_lat numeric(9,6),
  add column if not exists boarding_lng numeric(9,6),
  add column if not exists alighting_lat numeric(9,6),
  add column if not exists alighting_lng numeric(9,6);
