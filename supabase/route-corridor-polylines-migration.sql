-- Rajlo — corridor road polylines for honest "on-the-road" detection
--
-- The pathfinder previously projected a rider's pickup onto the
-- STRAIGHT LINE between corridor endpoints. On Jamaica's coastal /
-- mountain roads that line cuts huge distances inside bays and around
-- bends — a rider standing literally on the Orange Bay → Negril road
-- would compute as 6 km off the segment because the straight line
-- ran across the bay.
--
-- This column stores the actual driving polyline (Google Directions)
-- as a JSONB array of `{lat, lng}` points so the projection follows
-- the road, not the great-circle. Populated lazily by the pathfinder
-- on first read of an active route; cached forever until the admin
-- edits the route (cache-invalidation already wired via
-- invalidateRouteGraphCache + admin route tooling).
--
-- Nullable: a route without a polyline falls back to the straight-line
-- segment between origin/destination endpoints — the previous
-- behaviour, used as a safety net when Directions API is unreachable.

alter table public.routes
  add column if not exists path_polyline jsonb;

-- Partial index lets the pathfinder cheaply find routes that still
-- need their polyline fetched on cold-cache builds.
create index if not exists idx_routes_missing_polyline
  on public.routes (id)
  where path_polyline is null
    and origin_lat is not null
    and destination_lat is not null;
