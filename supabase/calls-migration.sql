-- Rajlo — in-app voice calls between rider and driver
--
-- The `calls` table tracks every voice-call session opened during a
-- trip. Two endpoints share a LiveKit room (rider + driver); the row
-- records who started it, who picked up, when it ended, and how long
-- it ran for. Used for:
--
--   • Real-time signalling — the rider/driver app subscribes to
--     INSERTs on this table via Supabase Realtime to learn there's
--     an incoming call (more immediate than the push-notification
--     fallback, which can be delayed by browser/OS).
--
--   • Call history — show "1 missed call from driver" in the rider's
--     ride detail, plus an audit trail for support investigations
--     ("did the driver actually call before marking no_show?").
--
--   • Privacy — phone numbers never leave the server. Drivers and
--     riders can never see each other's PSTN number in the app;
--     all voice contact flows through LiveKit on the trip's
--     short-lived room.
--
-- Exactly one of `ride_id`, `hail_id`, or `journey_id` is set per
-- call — the trip context the call belongs to. RLS lets either
-- party of a trip read their own calls; everything else is service
-- role.

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),

  -- Trip context. Exactly one of these is non-null. The CHECK below
  -- enforces it. ON DELETE CASCADE on each so wiping a ride / hail
  -- also wipes its call history.
  ride_id uuid references public.rides(id) on delete cascade,
  hail_id uuid references public.route_hails(id) on delete cascade,
  journey_id uuid references public.route_journeys(id) on delete cascade,

  -- The two parties. caller_id INITIATED, callee_id received. Both
  -- reference auth.users (not drivers / profiles) so RLS can match
  -- against auth.uid() cheaply.
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  caller_role text not null check (caller_role in ('rider', 'driver')),

  -- LiveKit room name. Deterministic from trip + timestamp so it's
  -- unique per call and traceable by support.
  room_name text not null unique,

  -- Lifecycle.
  --   initiated → caller created the call, callee not yet notified
  --   ringing   → callee notified (push delivered OR realtime fired)
  --   accepted  → callee joined the LiveKit room
  --   ended     → either side hung up
  --   missed    → ringing timed out (~30s) without accept
  --   declined  → callee explicitly tapped Decline
  status text not null default 'initiated' check (
    status in ('initiated', 'ringing', 'accepted', 'ended', 'missed', 'declined')
  ),

  -- Timestamps for each transition. duration_seconds is computed
  -- when status flips to `ended`.
  started_at timestamptz not null default now(),
  ringing_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),

  -- Optional reason on end: "caller_hangup" / "callee_hangup" /
  -- "timeout" / "network_error". For support, not for UI.
  end_reason text,

  created_at timestamptz not null default now(),

  -- Exactly one trip context.
  check (
    (ride_id is not null)::int +
    (hail_id is not null)::int +
    (journey_id is not null)::int = 1
  ),

  -- Caller and callee must be different people.
  check (caller_id <> callee_id)
);

create index if not exists idx_calls_ride_id on public.calls(ride_id)
  where ride_id is not null;
create index if not exists idx_calls_hail_id on public.calls(hail_id)
  where hail_id is not null;
create index if not exists idx_calls_journey_id on public.calls(journey_id)
  where journey_id is not null;
create index if not exists idx_calls_caller_id on public.calls(caller_id);
create index if not exists idx_calls_callee_id on public.calls(callee_id);
create index if not exists idx_calls_status on public.calls(status)
  where status in ('initiated', 'ringing', 'accepted');

-- ─── RLS ───
-- Either party of a call can SELECT their own rows. INSERT / UPDATE
-- is service-role only (the /api/calls/* endpoints write here).
alter table public.calls enable row level security;

drop policy if exists "calls: parties can read their own" on public.calls;
create policy "calls: parties can read their own"
  on public.calls
  for select
  using (auth.uid() = caller_id or auth.uid() = callee_id);

-- ─── Realtime ───
-- Publish INSERTs and UPDATEs so the rider/driver app can subscribe
-- and learn about incoming calls immediately, without polling.
alter publication supabase_realtime add table public.calls;
