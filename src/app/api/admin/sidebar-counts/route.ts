import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/sidebar-counts
 *
 * Counts of "pending / open / needs attention" rows for each admin
 * queue, keyed by the sidebar href that surfaces it. Powers the
 * little count badges on the admin sidebar — at-a-glance "you have
 * 3 payouts and 2 verifications waiting" without the admin clicking
 * through every page.
 *
 * Returns: { counts: { "/admin/payouts": 3, ... } }
 *
 * Defensive: each query is independently try/catched. A missing
 * table or schema drift in any single queue produces no badge for
 * that route instead of breaking the whole sidebar.
 *
 * No-store + service-role: admin role gate via requireAdmin; the
 * query runs against the service-role client so RLS doesn't strip
 * rows the admin should see in aggregate.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const counts: Record<string, number> = {};

  /** Run a count query and write the result under `href` if it
   *  returned a positive number. Swallows any error so a missing
   *  table or schema mismatch doesn't 500 the whole endpoint. */
  const tally = async (
    href: string,
    fetch: () => PromiseLike<{ count: number | null; error: unknown }>,
  ) => {
    try {
      const { count, error } = await fetch();
      if (!error && typeof count === "number" && count > 0) {
        counts[href] = count;
      }
    } catch {
      /* swallow */
    }
  };

  await Promise.all([
    // Payouts — both the new /admin/payouts dashboard and the
    // legacy /admin/wallet-withdrawals (which the existing nav
    // entry still points at on older deploys).
    tally("/admin/payouts", () =>
      supabase
        .from("wallet_withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),
    tally("/admin/wallet-withdrawals", () =>
      supabase
        .from("wallet_withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),

    // Verification queue — pending driver documents (license, registration,
    // insurance, etc.) awaiting admin review.
    tally("/admin/verification-queue", () =>
      supabase
        .from("driver_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),

    // Vehicle changes — driver swapped cars, needs admin to bless
    // the new vehicle before they go online with it.
    tally("/admin/vehicle-changes", () =>
      supabase
        .from("vehicle_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ),

    // Incidents — open safety incidents (rider/driver report, panic
    // button, off-route detection trigger, etc.).
    tally("/admin/incidents", () =>
      supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ),

    // Fraud & risk — open investigations (multi-account, suspicious
    // ride pattern, dispute flag).
    tally("/admin/fraud", () =>
      supabase
        .from("fraud_investigations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ),

    // Safety — alerts not yet acknowledged. Safety_alerts schema
    // may not have a single canonical "open" flag in every deploy,
    // so we filter on acknowledged_at being null which is more
    // portable across schema versions.
    tally("/admin/safety", () =>
      supabase
        .from("safety_alerts")
        .select("id", { count: "exact", head: true })
        .is("acknowledged_at", null),
    ),
  ]);

  return NextResponse.json({ counts });
}
