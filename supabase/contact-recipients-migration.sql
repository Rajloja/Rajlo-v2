-- Rajlo — contact-form recipient roster
--
-- The public /contact form historically delivered every submission to
-- a single inbox pinned in env (CONTACT_INBOX_EMAIL). This migration
-- moves the recipient list into the database so admins can add,
-- remove, or temporarily disable recipients without a redeploy.
--
-- Schema:
--   contact_recipients
--     id            uuid PK
--     email         text  unique, not null (citext-ish: lower())
--     active        boolean default true — soft-disable without delete
--     note          text   nullable — admin-facing label (e.g. "Founder")
--     created_at    timestamptz
--     created_by    uuid    nullable — auth.users(id) of the admin who
--                                       added the row, if any. Seeds
--                                       are null because no admin
--                                       added them.
--
-- The /api/contact endpoint reads `email` for every row where
-- `active = true` and emails each one. If the table is empty for any
-- reason (table missing, RLS blocks, DB outage) the endpoint falls
-- back to the legacy CONTACT_INBOX_EMAIL env var so the form never
-- silently swallows a submission.

create table if not exists public.contact_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Case-insensitive uniqueness on email — same email can't be added
-- twice even if differently-cased. Enforced at the DB layer because
-- the API also normalises to lower() before insert.
create unique index if not exists contact_recipients_email_lower_unique
  on public.contact_recipients (lower(email));

-- Read-side index — the contact endpoint fetches every active row
-- on each submission, so a partial index keeps that scan tiny once
-- the table has retired (`active=false`) addresses sitting in it.
create index if not exists contact_recipients_active_idx
  on public.contact_recipients (active)
  where active = true;

-- RLS: only admins can read / write. The /api/contact endpoint uses
-- the service-role client to read the active list (bypassing RLS) so
-- public form submissions don't need admin credentials.
alter table public.contact_recipients enable row level security;

drop policy if exists contact_recipients_admin_read on public.contact_recipients;
create policy contact_recipients_admin_read on public.contact_recipients
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists contact_recipients_admin_write on public.contact_recipients;
create policy contact_recipients_admin_write on public.contact_recipients
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Seed the three default recipients. Idempotent via ON CONFLICT on
-- the lower(email) index so re-running the migration is safe.
insert into public.contact_recipients (email, note, active)
values
  ('raj@rajlo.com',     'Founder',          true),
  ('daniel@rajlo.com',  'Engineering',      true),
  ('support@rajlo.com', 'Support inbox',    true)
on conflict (lower(email))
do nothing;
