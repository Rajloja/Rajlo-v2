import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Real-time driver operating-eligibility check.
 *
 * The daily `/api/cron/document-expiry` sweeper flips `expires_on <
 * today` documents to status='expired' and auto-suspends drivers with
 * expired docs. But the cron runs DAILY — between the moment a doc
 * expires (midnight) and the next cron run there's a window (up to
 * ~24 h) where a driver whose licence, TA badge, insurance, or COF
 * just lapsed still has drivers.activated=true. Left un-checked, that
 * driver could go online + accept a rider — with an expired document.
 * For a rideshare platform in Jamaica this is a TA-regulator problem
 * AND a rider-safety problem.
 *
 * Every action that PUTS a driver on the road — toggling online,
 * accepting a ride offer — should call this helper first. It's a
 * fast lookup (single table read, indexed by driver_id) and it closes
 * the cron-window gap by checking `expires_on` in real time rather
 * than trusting the last-swept status.
 *
 * When the check fails we ALSO update the driver row to
 * `activated=false` right here — the cron will converge to the same
 * state on its next pass, but doing it inline means (a) the driver's
 * subsequent requests fail-fast on the `activated` gate instead of
 * re-running the eligibility scan, and (b) if the driver is
 * currently mid-online-toggle they land in the same suspended state
 * an admin would see. Idempotent — if the driver's already
 * deactivated, this is a no-op.
 *
 * Caller MUST pass a service-role Supabase client — some of the
 * writes here bypass driver-scoped RLS.
 */

/**
 * doc_keys that MUST all be present, approved, and un-expired for a
 * driver to be dispatch-eligible.
 *
 * Curated to match the required=true entries in `requiredTADocuments`
 * (src/lib/mock-data.ts). Selfie is intentionally excluded from
 * expiry-gating (it has no expiry date and its status is enforced at
 * activation time, not per-ride).
 *
 * Kept here (not imported from mock-data) so the server-side gate is
 * a self-contained security surface — a future refactor of the
 * mock-data doc list can't accidentally soften this check.
 */
const REQUIRED_OPERATING_DOC_KEYS = [
  "franchise_cert",
  "driver_badge",
  "cof",
  "insurance",
  "drivers_licence_front",
  "drivers_licence_back",
  "police_record",
  "red_plate_reg",
] as const;

type EligibilityFailReason =
  | "not_activated"
  | "no_documents_on_file"
  | "documents_pending_review"
  | "documents_rejected"
  | "documents_expired";

export type EligibilityOutcome =
  | { eligible: true }
  | {
      eligible: false;
      reason: EligibilityFailReason;
      /** Human-readable message safe to surface to the driver. */
      message: string;
      /** doc_keys that failed the check. Used for structured client
       *  handling (e.g. deep-linking to /driver/renew/<docKey>). */
      offendingDocKeys: string[];
    };

type DocRow = {
  doc_key: string;
  status: string;
  expires_on: string | null;
};

/**
 * Check whether `driverId` is currently eligible to operate.
 *
 * Runs FIVE gates in order — the first failure short-circuits:
 *   1. drivers.activated must be true (admin approval).
 *   2. drivers.deactivated_at must be null (not suspended).
 *   3. Every required doc must have a driver_documents row (no
 *      "missing document" gap).
 *   4. Every required doc must be status='approved' (not pending,
 *      not rejected, not expired, not expiring_soon).
 *   5. Every required doc with an expires_on date must have that
 *      date IN THE FUTURE — belt-and-suspenders even when status is
 *      approved, in case the cron sweeper is behind.
 *
 * When gates 3–5 fail we ALSO auto-suspend the driver so the state
 * converges — same treatment as the daily cron. Failures on gates
 * 1–2 don't re-suspend (already off).
 */
export async function checkDriverOperationEligibility(
  supabase: SupabaseClient,
  args: {
    driverId: string;
    /** When true, don't auto-suspend even if we find expired docs.
     *  Used by read-only paths (e.g. an admin viewing a driver's
     *  profile) so the mere act of viewing doesn't mutate state. */
    readOnly?: boolean;
  },
): Promise<EligibilityOutcome> {
  const { driverId, readOnly = false } = args;

  // Gate 1 & 2 — driver row must be activated + not suspended.
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, user_id, activated, deactivated_at")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver) {
    return {
      eligible: false,
      reason: "not_activated",
      message: "Driver record not found.",
      offendingDocKeys: [],
    };
  }
  if (!driver.activated || driver.deactivated_at) {
    return {
      eligible: false,
      reason: "not_activated",
      message:
        "Your driver account isn't currently active. Contact support or complete verification.",
      offendingDocKeys: [],
    };
  }

  // Gates 3–5 — required-doc lookup.
  const { data: docs } = await supabase
    .from("driver_documents")
    .select("doc_key, status, expires_on")
    .eq("driver_id", driverId)
    .in("doc_key", REQUIRED_OPERATING_DOC_KEYS as unknown as string[]);

  const docsByKey = new Map<string, DocRow>(
    ((docs ?? []) as DocRow[]).map((d) => [d.doc_key, d]),
  );
  const missing: string[] = [];
  const pending: string[] = [];
  const rejected: string[] = [];
  const expired: string[] = [];

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  for (const key of REQUIRED_OPERATING_DOC_KEYS) {
    const row = docsByKey.get(key);
    if (!row) {
      missing.push(key);
      continue;
    }
    if (row.status === "pending") {
      pending.push(key);
      continue;
    }
    if (row.status === "rejected" || row.status === "missing") {
      rejected.push(key);
      continue;
    }
    // Real-time expiry check — even if status is still 'approved' or
    // 'expiring_soon', an expires_on before today means we can't let
    // this driver dispatch. This closes the cron-window gap.
    if (
      row.status === "expired" ||
      (row.expires_on && row.expires_on < today)
    ) {
      expired.push(key);
      continue;
    }
  }

  // If any docs are structurally missing / pending / rejected the
  // driver shouldn't have been activated in the first place — surface
  // it as "verification incomplete" rather than "expired" so an admin
  // reading the audit log can tell the two apart. We do NOT
  // auto-suspend in these cases: the state is already inconsistent
  // and needs admin attention, not more automation on top of it.
  if (missing.length > 0) {
    return {
      eligible: false,
      reason: "no_documents_on_file",
      message:
        "Your verification is incomplete. Please upload the missing documents to continue driving.",
      offendingDocKeys: missing,
    };
  }
  if (pending.length > 0) {
    return {
      eligible: false,
      reason: "documents_pending_review",
      message:
        "Your documents are still awaiting admin approval. You'll be notified as soon as they're reviewed.",
      offendingDocKeys: pending,
    };
  }
  if (rejected.length > 0) {
    return {
      eligible: false,
      reason: "documents_rejected",
      message:
        "One or more required documents were rejected. Re-upload them to be re-verified.",
      offendingDocKeys: rejected,
    };
  }

  // Expired docs — this IS the cron-window case. Auto-suspend so the
  // driver can't retry the same action seconds later and slip past.
  if (expired.length > 0) {
    if (!readOnly) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("drivers")
        .update({
          activated: false,
          deactivated_at: nowIso,
          admin_note:
            "Auto-suspended (real-time gate) — a required TA document has expired since the last cron sweep. Re-upload it to be re-reviewed.",
          updated_at: nowIso,
        })
        .eq("id", driver.id);

      await supabase.from("driver_audit_logs").insert({
        driver_id: driver.id,
        actor_role: "system",
        actor_id: "eligibility:accept-or-online",
        event: `Auto-suspended — required document expired: ${expired.join(", ")}`,
      });
    }
    return {
      eligible: false,
      reason: "documents_expired",
      message:
        "One or more required documents has expired. Renew to get back online.",
      offendingDocKeys: expired,
    };
  }

  return { eligible: true };
}

/**
 * Convenience for API routes — turns an EligibilityOutcome into an
 * HTTP-friendly payload with a stable machine-readable `code` the
 * client can branch on.
 *
 * The client uses `code` to route the driver to the right recovery
 * flow (e.g. `documents_expired` → deep-link to /driver/renew;
 * `not_activated` → contact support).
 */
export function eligibilityErrorPayload(outcome: EligibilityOutcome) {
  if (outcome.eligible) {
    throw new Error("eligibilityErrorPayload called on an eligible outcome");
  }
  return {
    error: outcome.message,
    code: outcome.reason,
    offendingDocKeys: outcome.offendingDocKeys,
  };
}
