-- ─────────────────────────────────────────────────────────────────────
-- Multi-leg route taxi journeys
--
-- A "journey" lets a rider chain multiple route taxi corridors when no
-- direct corridor connects their A → B. The system finds the cheapest
-- chain (e.g. 7-Mile → Negril Bus Park → Sav-la-Mar), locks the TOTAL
-- fare in the rider's wallet upfront, and settles each leg as it
-- completes — paying that leg's driver and consuming that leg's portion
-- of the hold. Existing single-leg flow is unchanged; a single-leg trip
-- is just a journey of length 1.
--
-- Tables:
--   route_journeys   — one row per multi-leg (or single-leg) trip.
--   wallet_holds     — soft locks on wallet balance. Available balance
--                      = balance_jmd − SUM(active holds). Status flips
--                      to `consumed` when leg settles or `released`
--                      when journey cancels.
--
-- Additive changes:
--   route_hails: + journey_id, + leg_order, + is_transfer_leg
--
-- RLS: rider reads own journeys + holds; everything else is service
-- role. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════
-- 1. route_journeys
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.route_journeys (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete cascade,

  -- Endpoints. Stored even though the legs carry their own pickup /
  -- dropoff — needed for history scanning + the journey-quote-replay
  -- when a rider re-books.
  origin_name text not null,
  origin_lat numeric(9,6),
  origin_lng numeric(9,6),
  destination_name text not null,
  destination_lat numeric(9,6),
  destination_lng numeric(9,6),

  status text not null default 'planning',
  -- planning  → journey created, hold placed, leg 1 not yet broadcast.
  --             Mostly transient (we flip to `active` synchronously
  --             after the leg-1 hail insert), but it's a real state
  --             because the rider can bail before leg 1 broadcasts.
  -- active    → at least one leg in flight or pending broadcast.
  -- completed → all legs settled.
  -- cancelled → rider bailed mid-journey OR an unrecoverable failure.

  total_fare_jmd integer not null check (total_fare_jmd > 0),
  planned_leg_count integer not null check (planned_leg_count >= 1),
  completed_leg_count integer not null default 0 check (completed_leg_count >= 0),
  concession boolean not null default false,

  -- Snapshot of the planned route at quote time. Persisting it (rather
  -- than recomputing) means a reroute / corridor edit later can't
  -- silently mutate the rider's already-priced journey.
  plan jsonb not null,

  -- Settlement bookkeeping — running totals, recomputed on every
  -- leg settle so reconciliation is a single SELECT.
  settled_fare_jmd integer not null default 0 check (settled_fare_jmd >= 0),
  refunded_fare_jmd integer not null default 0 check (refunded_fare_jmd >= 0),

  cancellation_reason text,
  cancelled_by text,

  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists route_journeys_rider_idx
  on public.route_journeys(rider_id, created_at desc);
create index if not exists route_journeys_status_idx
  on public.route_journeys(status, created_at desc);

alter table public.route_journeys enable row level security;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'route_journeys_status_check'
  ) then
    alter table public.route_journeys
      add constraint route_journeys_status_check
      check (status in ('planning', 'active', 'completed', 'cancelled'));
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'route_journeys_cancelled_by_check'
  ) then
    alter table public.route_journeys
      add constraint route_journeys_cancelled_by_check
      check (cancelled_by is null or cancelled_by in ('rider', 'system', 'admin'));
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'route_journeys_settled_lte_total'
  ) then
    alter table public.route_journeys
      add constraint route_journeys_settled_lte_total
      check (settled_fare_jmd + refunded_fare_jmd <= total_fare_jmd);
  end if;
end $$;

drop policy if exists route_journeys_rider_select on public.route_journeys;
create policy route_journeys_rider_select on public.route_journeys
  for select using (auth.uid() = rider_id);

-- ══════════════════════════════════════════════════════════════════════
-- 2. wallet_holds — soft locks on rider balance
-- ══════════════════════════════════════════════════════════════════════
--
-- Holds aren't real money movement; they're a virtual lock that
-- reduces the rider's spendable balance without writing to
-- wallet_transactions. When a leg settles, we consume the matching
-- portion (decrement the hold amount, write a real ride_charge
-- transaction). When the journey cancels mid-flight, we release the
-- remaining hold. This keeps the audit story clean: every actual
-- money movement is still a row in wallet_transactions.
--
-- Available balance = wallets.balance_jmd − SUM(active wallet_holds.amount_jmd).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.wallet_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_id uuid references public.route_journeys(id) on delete set null,

  -- The hold "envelope": initial amount placed at journey start,
  -- and the running outstanding amount as legs settle. We track
  -- both so admin tooling can see "started at $X, $Y consumed".
  initial_amount_jmd integer not null check (initial_amount_jmd > 0),
  amount_jmd integer not null check (amount_jmd >= 0),

  status text not null default 'active',
  -- active    → outstanding balance > 0, locking the rider.
  -- consumed  → fully spent against legs (terminal).
  -- released  → cancelled / refunded back to free balance (terminal).
  -- partial   → some legs settled, then released (e.g. journey
  --             cancelled with legs already paid).

  reason text not null default 'route_journey',
  metadata jsonb default '{}'::jsonb,

  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_holds_user_active_idx
  on public.wallet_holds(user_id, status)
  where status = 'active';
create index if not exists wallet_holds_journey_idx
  on public.wallet_holds(journey_id);

alter table public.wallet_holds enable row level security;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'wallet_holds_status_check'
  ) then
    alter table public.wallet_holds
      add constraint wallet_holds_status_check
      check (status in ('active', 'consumed', 'released', 'partial'));
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'wallet_holds_amount_lte_initial'
  ) then
    alter table public.wallet_holds
      add constraint wallet_holds_amount_lte_initial
      check (amount_jmd <= initial_amount_jmd);
  end if;
end $$;

drop policy if exists wallet_holds_user_select on public.wallet_holds;
create policy wallet_holds_user_select on public.wallet_holds
  for select using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════
-- 3. route_hails — link legs to a journey
-- ══════════════════════════════════════════════════════════════════════
--
-- Three additive columns. `journey_id` null = legacy single-leg flow
-- (today's behavior — unchanged). `leg_order` numbers legs 1..N within
-- a journey (1 = first hail the rider boards). `is_transfer_leg` is
-- true for every leg after leg 1 — used by the predictive matcher to
-- know "this hail needs a transfer arrival broadcast, not a normal
-- corridor-wide broadcast".

alter table public.route_hails
  add column if not exists journey_id uuid references public.route_journeys(id) on delete set null,
  add column if not exists leg_order integer,
  add column if not exists is_transfer_leg boolean not null default false;

create index if not exists route_hails_journey_idx
  on public.route_hails(journey_id, leg_order)
  where journey_id is not null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'route_hails_leg_order_check'
  ) then
    alter table public.route_hails
      add constraint route_hails_leg_order_check
      check (leg_order is null or leg_order >= 1);
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. updated_at trigger for the new tables
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists route_journeys_touch_updated_at on public.route_journeys;
create trigger route_journeys_touch_updated_at
  before update on public.route_journeys
  for each row execute function public.touch_updated_at();

drop trigger if exists wallet_holds_touch_updated_at on public.wallet_holds;
create trigger wallet_holds_touch_updated_at
  before update on public.wallet_holds
  for each row execute function public.touch_updated_at();
