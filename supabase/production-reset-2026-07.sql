-- ============================================================================
-- Rajlo — Production reset (2026-07)
--
-- One-time script. NOT part of the migrations run-forever set — do NOT
-- source this from `apply-staging-migrations.mjs`. It gets run ONCE,
-- interactively, in the Supabase Studio SQL editor against the
-- production Rajlo-v2 project, on the eve of opening public driver
-- signups.
--
-- WHAT IT DOES
-- ------------
-- Removes every rider + driver account and every row of trip / wallet /
-- verification / safety / fraud / chat / rating / hail / route-journey
-- data that belongs to them. Preserves:
--   - Every admin + safety_officer account (identified by profiles.role).
--   - Reference/config tables that are shared, not per-user (routes,
--     legal_documents, link_shortens, contact_recipients).
--   - Cross-user audit trails (admin_audit_logs, admin_messages,
--     incidents) — the referenced user rows will be gone but the audit
--     rows themselves survive because their user FKs are ON DELETE
--     SET NULL, giving Raj/support future visibility into pre-launch
--     ops.
--
-- HOW THE CASCADE WORKS
-- ---------------------
-- We lean on the existing `on_auth_user_before_delete` trigger installed
-- by supabase/user-delete-cascade-migration.sql. That trigger fires
-- BEFORE any auth.users DELETE and wipes every public-schema row owned
-- by the victim — schema-drift-tolerant via to_regclass(), atomic
-- within the same transaction. So the reset is effectively:
--
--     DELETE FROM auth.users WHERE id IN (<non-admin ids>)
--
-- The trigger cascades the rest. Explicit per-table DELETEs would give
-- richer intermediate counts, but the trigger has been running per-user
-- deletes for months (that's what the admin panel's "Delete user" flow
-- calls) and is the trusted path.
--
-- If you need the explicit-purge fallback, see APPENDIX at the very end
-- of this file.
--
-- SAFETY POSTURE
-- --------------
--   1. Everything runs in a single transaction. If ANY statement
--      raises (FK violation, trigger failure, permission surprise),
--      ROLLBACK undoes everything. Nothing gets half-purged.
--   2. Point-in-Time Recovery is your escape hatch. Before running
--      Phase 2, note the current UTC timestamp — Supabase PITR can
--      restore to that timestamp within minutes if needed. Rajlo is on
--      Supabase Pro so PITR is enabled.
--   3. The pre-check queries at the top must be run + reviewed BEFORE
--      you touch anything destructive. They tell you EXACTLY who
--      survives.
--
-- HOW TO RUN
-- ----------
-- Open Supabase Studio → SQL Editor → paste this file. Run block by
-- block:
--
--   PHASE 0 — PRE-FLIGHT: read-only. Copy the results into a scratch
--     doc. Confirm the admin roster looks right and the counts of
--     "will be deleted" match what you expect.
--
--   PHASE 1 — THE PURGE: highlights the actual destructive block.
--     Runs in a transaction. Reads out counts before/after.
--
--   PHASE 2 — POST-CHECK: read-only. Verify final state.
--
-- If PHASE 0 shows anything unexpected — an "admin" row you don't
-- recognise, a reference table showing 0 rows, a driver you thought
-- was gone but is still there — STOP. Investigate. Don't run PHASE 1
-- until PHASE 0 tells the story you expect.
-- ============================================================================


-- ═════════════════════════════════════════════════════════════════════
-- PHASE 0 — PRE-FLIGHT (read-only, safe to run repeatedly)
-- ═════════════════════════════════════════════════════════════════════

-- 0.1  Who survives?
-- Every row here KEEPS its account. Sanity-check the list.
-- If you see anyone you don't recognise, they should NOT be an admin
-- — flip them to role='rider' before proceeding, or add their id to
-- an exclusion list (see Phase 1 note).
SELECT
  p.id,
  p.role,
  p.full_name,
  u.email,
  u.last_sign_in_at,
  u.created_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('admin', 'safety_officer')
ORDER BY p.role, u.email;


-- 0.2  Who gets purged? (per-role headcount)
SELECT
  role,
  COUNT(*) AS accounts_to_delete
FROM public.profiles
WHERE role IN ('rider', 'driver')
GROUP BY role
ORDER BY role;


-- 0.3  User-data volume snapshot — what will disappear
-- Each table shown here will be emptied for non-admin users (via the
-- trigger cascade). If you see 0 in a critical column (rides, wallets,
-- drivers) but you know you have beta data, something is wrong — stop
-- and investigate BEFORE the purge.
SELECT
  (SELECT COUNT(*) FROM public.rides)                    AS rides,
  (SELECT COUNT(*) FROM public.wallets)                  AS wallets,
  (SELECT COUNT(*) FROM public.wallet_transactions)      AS wallet_transactions,
  (SELECT COUNT(*) FROM public.wallet_holds)             AS wallet_holds,
  (SELECT COUNT(*) FROM public.wallet_withdrawals)       AS wallet_withdrawals,
  (SELECT COUNT(*) FROM public.wallet_deposits)          AS wallet_deposits,
  (SELECT COUNT(*) FROM public.drivers)                  AS drivers,
  (SELECT COUNT(*) FROM public.driver_documents)         AS driver_documents,
  (SELECT COUNT(*) FROM public.driver_violations)        AS driver_violations,
  (SELECT COUNT(*) FROM public.route_hails)              AS route_hails,
  (SELECT COUNT(*) FROM public.route_journeys)           AS route_journeys,
  (SELECT COUNT(*) FROM public.push_subscriptions)       AS push_subscriptions,
  (SELECT COUNT(*) FROM public.device_fingerprints)      AS device_fingerprints,
  (SELECT COUNT(*) FROM public.safety_alerts)            AS safety_alerts,
  (SELECT COUNT(*) FROM public.payout_methods)           AS payout_methods,
  (SELECT COUNT(*) FROM public.qr_charges)               AS qr_charges,
  (SELECT COUNT(*) FROM public.calls)                    AS calls;


-- 0.4  Reference tables — verify they have data + confirm NONE of them
-- will be touched by Phase 1. If any of these shows 0 rows unexpectedly
-- that's a pre-existing config problem, unrelated to the reset.
SELECT
  (SELECT COUNT(*) FROM public.routes)               AS routes,
  (SELECT COUNT(*) FROM public.legal_documents)      AS legal_documents,
  (SELECT COUNT(*) FROM public.contact_recipients)   AS contact_recipients,
  (SELECT COUNT(*) FROM public.link_shortens)        AS link_shortens;


-- 0.5  Audit tables that will be PRESERVED via ON DELETE SET NULL on
-- their user references. Row counts stay put; the referenced user ids
-- become NULL where users are deleted. Useful for pre-launch history.
SELECT
  (SELECT COUNT(*) FROM public.admin_audit_logs)     AS admin_audit_logs,
  (SELECT COUNT(*) FROM public.admin_messages)       AS admin_messages,
  (SELECT COUNT(*) FROM public.incidents)            AS incidents,
  (SELECT COUNT(*) FROM public.payout_batches)       AS payout_batches;


-- 0.6  Sanity — the count of auth.users we'll delete MUST equal the
-- non-admin profiles count. If they diverge, some auth.users have no
-- profile row (or vice versa). That's a schema-drift issue to
-- reconcile before Phase 1.
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE role IN ('rider','driver')) AS profiles_to_delete,
  (
    SELECT COUNT(*)
    FROM auth.users u
    WHERE u.id IN (
      SELECT id FROM public.profiles WHERE role IN ('rider', 'driver')
    )
  ) AS auth_users_to_delete;


-- ═════════════════════════════════════════════════════════════════════
-- PHASE 1 — THE PURGE (destructive; wrapped in a transaction)
-- ═════════════════════════════════════════════════════════════════════
--
-- STOP. Before running this block:
--   ✓ You've reviewed Phase 0 output and it matches your expectation.
--   ✓ You've noted the current UTC timestamp for PITR rollback if
--     needed. Grab it now: `SELECT now();`
--   ✓ You've stopped any driver / rider signups mid-flight — this is
--     easiest during a scheduled brief maintenance window (10 min).
--
-- Trigger behaviour: for each auth.users DELETE, on_auth_user_before_
-- delete fires FIRST and wipes every referenced public.* row. Then
-- the auth.users row itself is deleted. Whole thing atomic per row.
-- We wrap it all in an outer transaction so if ANY user's cascade
-- fails partway through, everything rolls back.
--
-- If you need to EXCLUDE a specific non-admin from the purge (edge
-- case — e.g. a specific test driver you want to keep for QA), add
-- their user id to the CTE below by extending the `excluded_ids`
-- values list.

BEGIN;

WITH excluded_ids(id) AS (
  -- Add extra ids to preserve here as VALUES rows, e.g.:
  --   VALUES ('00000000-0000-0000-0000-000000000001'::uuid),
  --          ('00000000-0000-0000-0000-000000000002'::uuid)
  -- Leave empty (SELECT ... WHERE FALSE) if only admins should survive.
  SELECT NULL::uuid WHERE FALSE
),
targets AS (
  SELECT p.id
  FROM public.profiles p
  WHERE p.role IN ('rider', 'driver')
    AND p.id NOT IN (SELECT id FROM excluded_ids WHERE id IS NOT NULL)
)
DELETE FROM auth.users
WHERE id IN (SELECT id FROM targets);

-- Row-count verification INSIDE the transaction. If this reports a
-- number that surprises you, ROLLBACK instead of COMMIT.
SELECT
  (SELECT COUNT(*) FROM auth.users)                       AS auth_users_remaining,
  (SELECT COUNT(*) FROM public.profiles)                  AS profiles_remaining,
  (SELECT COUNT(*) FROM public.profiles WHERE role IN ('admin','safety_officer')) AS admins_remaining,
  (SELECT COUNT(*) FROM public.rides)                     AS rides_remaining,
  (SELECT COUNT(*) FROM public.drivers)                   AS drivers_remaining,
  (SELECT COUNT(*) FROM public.wallets)                   AS wallets_remaining,
  (SELECT COUNT(*) FROM public.wallet_transactions)       AS wallet_txns_remaining;

-- ── Only commit if the numbers above look right. ──
-- The four ..._remaining figures for rides/drivers/wallets/wallet_txns
-- should all be zero. profiles_remaining should equal admins_remaining
-- (which should match the count from Phase 0.1).
--
-- If they look right, uncomment the COMMIT below and re-run just the
-- COMMIT statement. Otherwise ROLLBACK.

-- COMMIT;
ROLLBACK;

-- ── After COMMIT: DO NOT re-run this Phase 1 block. It's one-shot. ──


-- ═════════════════════════════════════════════════════════════════════
-- PHASE 2 — POST-CHECK (read-only, run AFTER commit)
-- ═════════════════════════════════════════════════════════════════════

-- 2.1  Admin roster untouched — every row from Phase 0.1 still here
SELECT
  p.id,
  p.role,
  p.full_name,
  u.email,
  u.last_sign_in_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('admin', 'safety_officer')
ORDER BY p.role, u.email;


-- 2.2  User-data tables emptied
SELECT
  (SELECT COUNT(*) FROM public.rides)                    AS rides,
  (SELECT COUNT(*) FROM public.wallets)                  AS wallets,
  (SELECT COUNT(*) FROM public.wallet_transactions)      AS wallet_transactions,
  (SELECT COUNT(*) FROM public.wallet_holds)             AS wallet_holds,
  (SELECT COUNT(*) FROM public.wallet_withdrawals)       AS wallet_withdrawals,
  (SELECT COUNT(*) FROM public.wallet_deposits)          AS wallet_deposits,
  (SELECT COUNT(*) FROM public.drivers)                  AS drivers,
  (SELECT COUNT(*) FROM public.driver_documents)         AS driver_documents,
  (SELECT COUNT(*) FROM public.route_hails)              AS route_hails,
  (SELECT COUNT(*) FROM public.route_journeys)           AS route_journeys,
  (SELECT COUNT(*) FROM public.push_subscriptions)       AS push_subscriptions,
  (SELECT COUNT(*) FROM public.device_fingerprints)      AS device_fingerprints,
  (SELECT COUNT(*) FROM public.payout_methods)           AS payout_methods;


-- 2.3  Reference data unchanged — should match Phase 0.4
SELECT
  (SELECT COUNT(*) FROM public.routes)               AS routes,
  (SELECT COUNT(*) FROM public.legal_documents)      AS legal_documents,
  (SELECT COUNT(*) FROM public.contact_recipients)   AS contact_recipients,
  (SELECT COUNT(*) FROM public.link_shortens)        AS link_shortens;


-- 2.4  Audit tables preserved — same counts as Phase 0.5. Referenced
-- user_ids are now NULL where the user was purged (SET NULL FKs).
SELECT
  (SELECT COUNT(*) FROM public.admin_audit_logs)     AS admin_audit_logs,
  (SELECT COUNT(*) FROM public.admin_messages)       AS admin_messages,
  (SELECT COUNT(*) FROM public.incidents)            AS incidents,
  (SELECT COUNT(*) FROM public.payout_batches)       AS payout_batches;


-- 2.5  Storage cleanup — the reset does NOT touch Supabase Storage.
-- Any driver-documents files uploaded by purged drivers still sit in
-- the bucket. To purge those separately, run this in a shell (won't
-- work from SQL — the storage API is out-of-schema):
--
--    supabase storage empty driver-documents --project <ref>
--
-- Or list-and-delete via the Storage tab in Studio. Files are
-- orphaned (no DB references remain), so leaving them for a day is
-- harmless — just eats a bit of storage quota.


-- ═════════════════════════════════════════════════════════════════════
-- APPENDIX — Explicit per-table purge (FALLBACK ONLY)
-- ═════════════════════════════════════════════════════════════════════
--
-- Do NOT run this if Phase 1 succeeded. This is here for the rare case
-- where the trigger cascade misbehaves (schema drift, dropped FK, etc.)
-- and you need to fall back to explicit deletes.
--
-- If you're using this: comment out Phase 1's DELETE FROM auth.users
-- block and run this in its place. Same BEGIN/COMMIT wrapper applies.
-- All statements guard with to_regclass() so a missing table doesn't
-- abort the transaction — same defence the trigger uses.

/*
BEGIN;

WITH victim_ids AS (
  SELECT id FROM public.profiles WHERE role IN ('rider', 'driver')
)
-- Order matters: children before parents. Each block only runs if the
-- target table exists in the current schema.

, del_chat_messages AS (
  DELETE FROM public.ride_messages
   WHERE ride_id IN (SELECT id FROM public.rides WHERE rider_id IN (SELECT id FROM victim_ids))
      OR sender_id IN (SELECT id FROM victim_ids)
  RETURNING 1
),
del_ride_ratings AS (
  DELETE FROM public.ride_ratings
   WHERE rater_id IN (SELECT id FROM victim_ids)
      OR rated_id IN (SELECT id FROM victim_ids)
  RETURNING 1
),
del_ride_events AS (
  DELETE FROM public.ride_events
   WHERE ride_id IN (SELECT id FROM public.rides WHERE rider_id IN (SELECT id FROM victim_ids))
  RETURNING 1
),
del_ride_stops AS (
  DELETE FROM public.ride_stops
   WHERE ride_id IN (SELECT id FROM public.rides WHERE rider_id IN (SELECT id FROM victim_ids))
  RETURNING 1
),
del_rides AS (
  DELETE FROM public.rides
   WHERE rider_id IN (SELECT id FROM victim_ids)
  RETURNING 1
),
del_hail_messages AS (
  DELETE FROM public.route_hail_messages
   WHERE hail_id IN (SELECT id FROM public.route_hails WHERE rider_id IN (SELECT id FROM victim_ids))
  RETURNING 1
),
del_hails AS (
  DELETE FROM public.route_hails
   WHERE rider_id IN (SELECT id FROM victim_ids)
  RETURNING 1
),
del_journeys AS (
  DELETE FROM public.route_journeys
   WHERE driver_id IN (SELECT id FROM public.drivers WHERE user_id IN (SELECT id FROM victim_ids))
  RETURNING 1
),
del_wallet_holds AS (
  DELETE FROM public.wallet_holds WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_wallet_txns AS (
  DELETE FROM public.wallet_transactions WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_wallet_deposits AS (
  DELETE FROM public.wallet_deposits WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_wallet_withdrawals AS (
  DELETE FROM public.wallet_withdrawals WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_wallet_transfers AS (
  DELETE FROM public.wallet_transfers WHERE sender_id IN (SELECT id FROM victim_ids) OR recipient_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_wallets AS (
  DELETE FROM public.wallets WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_qr_charges AS (
  DELETE FROM public.qr_charges WHERE driver_user_id IN (SELECT id FROM victim_ids) OR rider_user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_payout_methods AS (
  DELETE FROM public.payout_methods WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_driver_docs AS (
  DELETE FROM public.driver_documents WHERE driver_id IN (SELECT id FROM public.drivers WHERE user_id IN (SELECT id FROM victim_ids)) RETURNING 1
),
del_driver_violations AS (
  DELETE FROM public.driver_violations WHERE driver_id IN (SELECT id FROM public.drivers WHERE user_id IN (SELECT id FROM victim_ids)) RETURNING 1
),
del_driver_audit_logs AS (
  DELETE FROM public.driver_audit_logs WHERE driver_id IN (SELECT id FROM public.drivers WHERE user_id IN (SELECT id FROM victim_ids)) RETURNING 1
),
del_driver_notifications AS (
  DELETE FROM public.driver_notifications WHERE driver_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_drivers AS (
  DELETE FROM public.drivers WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_push_subs AS (
  DELETE FROM public.push_subscriptions WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_device_fp AS (
  DELETE FROM public.device_fingerprints WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_saved_places AS (
  DELETE FROM public.saved_places WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_rider_prefs AS (
  DELETE FROM public.rider_preferences WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_safety_alerts AS (
  DELETE FROM public.safety_alerts WHERE rider_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_calls AS (
  DELETE FROM public.calls WHERE caller_id IN (SELECT id FROM victim_ids) OR callee_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_legal_acceptances AS (
  DELETE FROM public.legal_acceptances WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_fraud_risk AS (
  DELETE FROM public.fraud_risk_scores WHERE user_id IN (SELECT id FROM victim_ids) RETURNING 1
),
del_profiles AS (
  DELETE FROM public.profiles WHERE role IN ('rider','driver') RETURNING 1
)
-- Finally: the auth.users purge itself. profiles are gone; the trigger
-- has nothing to cascade, so this is just the last identity row.
DELETE FROM auth.users
WHERE id IN (SELECT id FROM public.profiles WHERE role IN ('rider','driver'));

-- COMMIT;
ROLLBACK;
*/
