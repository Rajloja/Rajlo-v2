-- ============================================================================
-- Rajlo — private-ride wallet holds
-- Run AFTER route-journeys-migration.sql.
--
-- What this does:
--   Adds `ride_id` to public.wallet_holds so a private (Mode A) ride can
--   lock its fare at booking time the same way a route-taxi journey
--   does. Before this migration, placeHold was route-taxi-only — private
--   rides did a one-shot "can the rider afford this?" check at booking
--   time and then let the fare drift; if the rider withdrew or spent the
--   money between booking and completion, the driver's on-complete debit
--   silently failed and the driver was NOT credited (per the
--   settlement_status='rider_debit_failed' branch in
--   src/app/api/driver/rides/[id]/status/route.ts). This closes that
--   hole for private rides.
--
-- Why a column and not just metadata:
--   - Indexable — release-on-cancel needs "find the active hold for this
--     ride" in O(1), not a jsonb scan.
--   - Referable — admin tooling can join wallet_holds→rides directly
--     when investigating settlement failures without unpacking JSON.
--   - Matches the existing shape — journey_id is already a first-class
--     FK. Doing the same for rides keeps the two paths symmetric.
--
-- Constraint: at most one of journey_id / ride_id is set for a given
-- hold. Route-taxi journeys hold at journey level (a journey can span
-- multiple legs / route_hails). Private rides hold at ride level. A hold
-- that names both would be ambiguous — we enforce that here.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.wallet_holds
  add column if not exists ride_id uuid references public.rides(id) on delete set null;

create index if not exists wallet_holds_ride_idx
  on public.wallet_holds(ride_id);

-- Partial index for the hot-path lookup: "the active hold for this ride."
-- release-on-cancel and consume-on-complete both use this. Small — only
-- covers rows that are actually locking a rider's balance right now.
create index if not exists wallet_holds_ride_active_idx
  on public.wallet_holds(ride_id, status)
  where status = 'active';

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'wallet_holds_journey_xor_ride'
  ) then
    alter table public.wallet_holds
      add constraint wallet_holds_journey_xor_ride
      check (
        -- Both null is allowed (an admin-tooling / test hold that's
        -- not tied to any specific journey or ride).
        (journey_id is null and ride_id is null)
        or (journey_id is not null and ride_id is null)
        or (journey_id is null and ride_id is not null)
      );
  end if;
end $$;
