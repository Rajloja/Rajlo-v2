-- ============================================================================
-- Rajlo — Driver payout system (bank-on-file + OTP + batched bank file)
--
-- Builds on top of the existing wallet_withdrawals table from
-- wallets-migration.sql. Adds:
--
--   1. **payout_methods** — per-driver saved Jamaican bank account.
--      Drivers add this once, can edit anytime. We snapshot it onto
--      each withdrawal row at request-time so editing the method
--      later doesn't rewrite past audit trails.
--
--   2. **payout_batches** — one row per CSV file the admin downloads
--      for the bank. Lets us trace which payouts went out in which
--      batch (when, who downloaded, what file name).
--
--   3. **wallet_withdrawals extensions**:
--        - OTP fields (otp_hash, otp_expires_at, otp_verified_at,
--          otp_attempts) — mirrors the wallet_transfers OTP pattern.
--        - payout_method_id + payout_method_snapshot (jsonb) — links
--          to the saved method + captures it for audit.
--        - batched_at + batch_id — set when admin downloads the
--          batch file. Drives the "batched" status.
--        - excluded_at + excluded_reason + excluded_email_sent_at —
--          admin opt-out flow (manual review needed, fraud check,
--          name mismatch, etc.).
--        - bank_reference — admin records the bank's transaction
--          reference after the payment confirms.
--
--   4. **Expanded status enum** for the lifecycle:
--        unverified → pending → batched → paid
--                            ↘ excluded (admin opt-out, auto-refund)
--                            ↘ cancelled (driver cancels, auto-refund)
--      Older statuses (processing, rejected) kept for back-compat
--      with rows created before this migration.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ─────────────── payout_methods ───────────────
-- One saved Jamaican bank account per driver. The unique constraint
-- on user_id keeps it 1:1 — if the driver wants to change banks they
-- update this row (we snapshot the snapshot onto pending withdrawals
-- so the change doesn't retroactively affect them).
create table if not exists public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Jamaican bank fields. Bank name is free-text rather than a
  -- foreign key to a banks table so the driver can write in any
  -- credit union / smaller institution we haven't pre-populated.
  bank_name text not null,
  branch text not null,
  account_number text not null,
  account_holder_name text not null,
  account_type text not null check (account_type in ('savings', 'chequing')),
  -- Routing / transit / sort code — the inter-bank identifier each
  -- Jamaican bank publishes. Some don't require it for in-bank
  -- credits; left optional.
  routing_number text,

  -- One method per driver. Editing the row (UPDATE) is the supported
  -- way to "change banks" — see the trigger that snapshots onto
  -- in-flight withdrawals so a mid-request change doesn't corrupt
  -- the pending payment.
  constraint payout_methods_user_unique unique (user_id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payout_methods_updated_at on public.payout_methods;
create trigger trg_payout_methods_updated_at
  before update on public.payout_methods
  for each row execute function public.set_updated_at();

alter table public.payout_methods enable row level security;

drop policy if exists "Driver sees own payout method" on public.payout_methods;
create policy "Driver sees own payout method"
  on public.payout_methods for select
  using (auth.uid() = user_id);

drop policy if exists "Driver inserts own payout method" on public.payout_methods;
create policy "Driver inserts own payout method"
  on public.payout_methods for insert
  with check (auth.uid() = user_id);

drop policy if exists "Driver updates own payout method" on public.payout_methods;
create policy "Driver updates own payout method"
  on public.payout_methods for update
  using (auth.uid() = user_id);


-- ─────────────── payout_batches ───────────────
-- One row per "Friday CSV" the admin downloads for the bank.
-- The actual file isn't stored — we regenerate from the linked
-- wallet_withdrawals rows if ever needed.
create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  -- Admin who triggered the download. nullable so deleting an admin
  -- doesn't blow away the batch history.
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Human-friendly file name we offered the admin at download. Stored
  -- so support can match a bank-side question to a specific file.
  file_name text not null,
  -- Pre-computed totals — set when the batch is closed.
  total_amount_jmd integer not null default 0,
  row_count integer not null default 0,
  -- Optional bank reference number once submitted (admin-entered).
  bank_submission_ref text,
  submitted_at timestamptz,
  -- When the admin marks the entire batch paid (some banks confirm
  -- the whole file rather than per-row).
  paid_at timestamptz
);

create index if not exists idx_payout_batches_created
  on public.payout_batches(created_at desc);


-- ─────────────── wallet_withdrawals — add columns ───────────────
-- Each ADD COLUMN is gated on column existence so re-runs are safe.

alter table public.wallet_withdrawals
  add column if not exists payout_method_id uuid
    references public.payout_methods(id) on delete set null;

alter table public.wallet_withdrawals
  add column if not exists payout_method_snapshot jsonb;

-- OTP fields — mirror wallet_transfers pattern (SHA-256 hash only,
-- never plain text; 10-minute TTL; bounded attempts).
alter table public.wallet_withdrawals
  add column if not exists otp_hash text;
alter table public.wallet_withdrawals
  add column if not exists otp_expires_at timestamptz;
alter table public.wallet_withdrawals
  add column if not exists otp_verified_at timestamptz;
alter table public.wallet_withdrawals
  add column if not exists otp_attempts integer not null default 0;

-- Batch + admin lifecycle
alter table public.wallet_withdrawals
  add column if not exists batched_at timestamptz;
alter table public.wallet_withdrawals
  add column if not exists batch_id uuid
    references public.payout_batches(id) on delete set null;
alter table public.wallet_withdrawals
  add column if not exists bank_reference text;

-- Exclusion flow
alter table public.wallet_withdrawals
  add column if not exists excluded_at timestamptz;
alter table public.wallet_withdrawals
  add column if not exists excluded_reason text;
alter table public.wallet_withdrawals
  add column if not exists excluded_email_sent_at timestamptz;

-- ─────────────── status enum — expand ───────────────
-- Drop the old CHECK and re-add with the full lifecycle. We accept
-- the legacy statuses (processing, rejected) so existing rows from
-- before this migration still validate.
alter table public.wallet_withdrawals
  drop constraint if exists wallet_withdrawals_status_check;
alter table public.wallet_withdrawals
  add constraint wallet_withdrawals_status_check
    check (status in (
      'unverified',  -- new: OTP issued but not yet entered. NOT visible to admin.
      'pending',     -- OTP verified (wallet debited), waiting for admin batch.
      'batched',     -- new: included in a downloaded batch CSV; waiting on bank.
      'paid',        -- bank confirmed.
      'excluded',    -- new: admin opted out of a batch (wallet auto-refunded).
      'cancelled',   -- driver cancelled before admin acted (wallet auto-refunded).
      -- Legacy statuses (rows pre-payout-rework). Don't use for new rows.
      'processing',
      'rejected'
    ));

-- Index the admin queue view: pending + batched ordered by request time.
create index if not exists idx_wallet_withdrawals_admin_queue
  on public.wallet_withdrawals(status, created_at desc)
  where status in ('pending', 'batched');

-- Index to find a driver's verifiable / cancellable in-flight payouts
-- quickly (e.g. for the "Cancel" button + the "you have a pending
-- request, can't start another" guard).
create index if not exists idx_wallet_withdrawals_user_status
  on public.wallet_withdrawals(user_id, status)
  where status in ('unverified', 'pending', 'batched');

-- ─────────────── snapshot trigger: copy method onto withdrawal ───────────────
-- When a wallet_withdrawals row is INSERTed with a payout_method_id
-- but no snapshot yet, copy the method's current state into the
-- snapshot column. Mirrors the rule "edits to the saved method don't
-- silently rewrite in-flight payouts" — the snapshot is the
-- authoritative record for the batch CSV.
create or replace function public.snapshot_payout_method()
returns trigger
language plpgsql
as $$
declare
  method public.payout_methods;
begin
  if new.payout_method_id is null then
    return new;
  end if;
  if new.payout_method_snapshot is not null then
    return new;
  end if;
  select * into method
  from public.payout_methods
  where id = new.payout_method_id;
  if found then
    new.payout_method_snapshot := jsonb_build_object(
      'bank_name', method.bank_name,
      'branch', method.branch,
      'account_number', method.account_number,
      'account_holder_name', method.account_holder_name,
      'account_type', method.account_type,
      'routing_number', method.routing_number
    );
    -- Also copy the bank fields onto the legacy columns so existing
    -- admin views that read bank_name / bank_account_number /
    -- account_holder_name keep working without a separate JSON
    -- unpack step.
    new.bank_name := method.bank_name;
    new.bank_account_number := method.account_number;
    new.account_holder_name := method.account_holder_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wallet_withdrawals_snapshot on public.wallet_withdrawals;
create trigger trg_wallet_withdrawals_snapshot
  before insert on public.wallet_withdrawals
  for each row execute function public.snapshot_payout_method();
