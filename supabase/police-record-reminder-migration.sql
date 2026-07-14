-- ============================================================================
-- Rajlo — police-record reminder tracking
--
-- WHY
-- ---
-- Police record is now OPTIONAL at driver onboarding — a field-agent
-- employer can complete a driver's signup at a taxi hub even when the
-- driver doesn't have a soft copy of their Good Conduct Certificate
-- on hand. The runtime eligibility gate still requires it before the
-- driver can go online, so we need to nudge the driver to upload it
-- after they sign in.
--
-- WHAT
-- ----
-- Adds two throttle columns to public.drivers so the cron at
-- /api/cron/police-record-reminder can send a weekly nudge email
-- without spamming.
--
--   police_record_reminder_sent_at
--     When the last reminder email was queued. NULL means "never
--     reminded yet." The cron only re-emails after this is older than
--     7 days.
--
--   police_record_reminder_count
--     How many reminders we've sent. Increments each time the cron
--     fires an email. Lets the email template escalate its tone
--     (gentle at count=1, more direct at count=5+) without needing
--     a second column for the tone.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS police_record_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS police_record_reminder_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.drivers.police_record_reminder_sent_at IS
  'When /api/cron/police-record-reminder last queued a reminder email. NULL = never sent. Used to throttle to weekly.';

COMMENT ON COLUMN public.drivers.police_record_reminder_count IS
  'How many police-record reminder emails have been sent. Used for tone escalation in the email template.';
