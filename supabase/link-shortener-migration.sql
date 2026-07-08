-- ============================================================================
-- Link shortener — private, expiring URL alias table
-- ----------------------------------------------------------------------------
-- Rajlo's transactional emails need to embed callback URLs that carry the
-- rider's in-flight booking context back to them after email confirmation.
-- These URLs are LONG:
--
--   https://<project>.supabase.co/auth/v1/verify?token=…&redirect_to=
--     https%3A%2F%2Frider.rajlo.com%2Fauth%2Fcallback%3Fnext%3D%252Frider%252F
--     request%253Fmode%253Dprivate%2526to_name%253DJamwest%252BMotorsports…
--
-- The double-encoded `redirect_to` alone can push the raw URL past 1 KB,
-- which:
--   - blows up the "if the button doesn't work" fallback line in the email
--     (see the recent verification-email screenshot)
--   - trips spam filters that flag messages containing giant URL blobs
--   - degrades the visual polish of an otherwise on-brand email
--
-- Fix: swap the giant destination for a Rajlo short slug (`/l/AbCd1234`).
-- The shortener stores the full URL server-side so the visible link is
-- ~30 chars, and everything after the slug's expiry auto-cleans up.
--
-- Table layout:
--   - `slug` — 8-char primary key, generated deterministically from the
--     target URL (see /api/link/shorten). Deterministic = same URL always
--     resolves to the same row, which makes the endpoint idempotent AND
--     naturally caps growth (a script pounding the endpoint with the same
--     URL doesn't spawn thousands of rows).
--   - `target_url` — the URL we redirect the visitor to.
--   - `expires_at` — hard expiry. Every hit past this timestamp 410s.
--     Default = 48 h from creation (long enough for someone to confirm
--     their email at their own pace, short enough that stale trip
--     context doesn't leak weeks later).
--   - `hit_count` — bumped on every successful redirect. Useful for the
--     admin to spot abuse patterns (an alias getting hit 10 000 times
--     is almost certainly being enumerated).
--
-- Security:
--   - RLS is ON with NO policies — anon and authed users can't touch the
--     table directly. All reads/writes go through the API route which
--     runs as the service role.
--   - The API route validates that every URL it stores is on a
--     *.rajlo.com host (or localhost in dev). This is the guard against
--     using the shortener as an open-redirect vector.
-- ============================================================================

create table if not exists public.link_shortens (
  slug text primary key,
  target_url text not null,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  hit_count integer not null default 0
);

comment on table  public.link_shortens is 'Short-lived URL aliases used by transactional emails.';
comment on column public.link_shortens.slug        is '8-char sha256-derived path segment. Deterministic per target URL.';
comment on column public.link_shortens.target_url  is 'The full destination URL. Must be on a *.rajlo.com host.';
comment on column public.link_shortens.expires_at  is 'Hard expiry — hits past this return 410 Gone and the row is swept.';
comment on column public.link_shortens.hit_count   is 'Bumps per redirect. Useful for admin abuse detection.';

-- Sweep index — the periodic cleanup function orders by this. Cheap on
-- a small table but pays off once entries pile up.
create index if not exists idx_link_shortens_expires_at
  on public.link_shortens (expires_at);

alter table public.link_shortens enable row level security;
-- No policies. Only the service-role client (API route) can read or write.

-- Lazy cleanup — the /l/[slug] route calls this once per ~100 hits so we
-- don't need a scheduled worker. Runs as SECURITY DEFINER so it doesn't
-- need a role that owns the table.
create or replace function public.purge_expired_link_shortens()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.link_shortens
   where expires_at < now()
  returning 1 into removed;
  get diagnostics removed = row_count;
  return coalesce(removed, 0);
end;
$$;

comment on function public.purge_expired_link_shortens is
  'Deletes every expired link_shortens row. Called lazily by /l/[slug].';