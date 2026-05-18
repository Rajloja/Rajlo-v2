-- Rajlo — geocoded route endpoints
--
-- Adds latitude/longitude for each route's origin and destination so
-- the route-taxi matcher can do TRUE geographic proximity matching
-- instead of relying on place-name token overlap (which false-matched
-- unrelated corridors that share a generic word like "Park" / "Bay").
--
-- Columns are nullable: a route without coordinates falls back to the
-- existing name + distance + parish matching. Populate them by running
-- `node scripts/geocode-routes.mjs` once (Google Geocoding API).

alter table public.routes
  add column if not exists origin_lat numeric(9, 6),
  add column if not exists origin_lng numeric(9, 6),
  add column if not exists destination_lat numeric(9, 6),
  add column if not exists destination_lng numeric(9, 6);

-- Partial index over routes that still need geocoding — lets the
-- geocode script cheaply find the gaps on re-runs.
create index if not exists idx_routes_missing_coords
  on public.routes (id)
  where origin_lat is null or destination_lat is null;
