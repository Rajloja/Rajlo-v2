-- Rajlo — drop the (origin_name, destination_name) unique index on routes
--
-- The TA PDF catalogue legitimately lists multiple distinct corridors that
-- share a simplified origin+destination name pair but differ in distance
-- and physical location. Example: two "Shrewsbury → Savanna La Mar"
-- routes — one is the village of Shrewsbury (13 km), the other is the
-- settlement near Logwood that the TA simplifies as "Shrewsbury" too
-- (15.5 km). They're physically different places served by different
-- corridors at different fares.
--
-- The original `ux_routes_origin_destination` index assumed every (origin,
-- destination) pair was unique. After re-parsing the PDF in `-table` mode
-- and switching the seed's slug strategy to suffix distance on collisions,
-- ~100 such legitimate duplicates exist. They blocked seed-routes.mjs
-- upserts with "duplicate key value violates unique constraint".
--
-- The `slug` column is already UNIQUE and is the right key for de-dup.
-- This migration drops the redundant (origin_name, destination_name)
-- constraint.
--
-- Replacement index keeps query performance on origin/destination lookups
-- without enforcing uniqueness.

drop index if exists public.ux_routes_origin_destination;

create index if not exists idx_routes_origin_destination_lower
  on public.routes(lower(origin_name), lower(destination_name));
