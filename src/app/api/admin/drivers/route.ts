import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/drivers
 *
 * Driver-focused list for the admin's Drivers page. Joins drivers +
 * profiles + driver_documents so the table can show plate, activation
 * status, document review state, and a `needsReview` flag for any
 * driver who has re-uploaded a previously-approved doc (e.g. a renewal
 * after expiry).
 *
 * Query:
 *   ?status=approved|pending_review|rejected|deactivated|needs_review|all
 *   ?q=<name | external_id | plate>
 *   ?limit=200 (max 500)
 *   ?offset=0
 *
 * Returns `{ drivers, total }` where `total` is the real DB count
 * matching the filters (not the page length). For the post-fetch
 * `needs_review` filter, `total` is the count after the in-memory
 * filter and pagination is single-shot (no load-more in that mode).
 */

type DriverRow = {
  id: string;
  externalId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  plateNumber: string | null;
  vehicle: string | null;
  parishOrRegion: string | null;
  onboardingStatus: string;
  activated: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  submittedAt: string | null;
  /** True when at least one doc was previously approved and is now
   *  pending again — i.e. the driver re-uploaded a renewal that the
   *  admin hasn't re-approved yet. */
  needsReview: boolean;
  /** Counts for the table summary chips. */
  docCounts: {
    approved: number;
    pending: number;
    rejected: number;
    missing: number;
  };
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? 200)),
  );
  const offset = Math.max(
    0,
    Number(url.searchParams.get("offset") ?? 0) || 0,
  );

  // `needs_review` filters AFTER hydrating per-row doc counts, so
  // pagination by DB range would produce inconsistent page sizes.
  // For that mode we fall back to single-shot: fetch a big batch,
  // apply the in-memory filter, return everything matching — the page
  // hides the Load-more button.
  const isPostFilter = status === "needs_review";

  // Build the base query + matching count query in parallel. The
  // count query is for the page-total chip + the page's `hasMore`
  // calculation; without it the client would need to keep paging
  // forever to discover the end.
  const baseQuery = () => {
    let q1 = supabase
      .from("drivers")
      .select(
        "id, user_id, external_id, first_name, last_name, email, phone, plate_number, vehicle_make, vehicle_model, vehicle_color, onboarding_status, activated, deactivated_at, created_at, submitted_at",
      )
      .order("created_at", { ascending: false });

    if (status === "approved") {
      q1 = q1.eq("onboarding_status", "approved").eq("activated", true);
    } else if (status === "pending_review") {
      q1 = q1.eq("onboarding_status", "pending_review");
    } else if (status === "rejected") {
      q1 = q1.eq("onboarding_status", "rejected");
    } else if (status === "deactivated") {
      q1 = q1.eq("activated", false).not("deactivated_at", "is", null);
    }
    if (q) {
      const safe = q.replace(/[,()]/g, "");
      q1 = q1.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,external_id.ilike.%${safe}%,plate_number.ilike.%${safe}%`,
      );
    }
    return q1;
  };

  // For the post-filter mode we pull a wide window then filter; the
  // client gets `hasMore: false` either way. For ranged modes we slice
  // [offset, offset+limit-1] and ask Postgres for the matching count.
  const ranged = isPostFilter
    ? baseQuery().limit(limit)
    : baseQuery().range(offset, offset + limit - 1);

  const countQuery = isPostFilter
    ? Promise.resolve({ count: null as number | null })
    : (async () => {
        // Run the same WHERE clauses with head:true + exact count.
        let c = supabase
          .from("drivers")
          .select("id", { count: "exact", head: true });
        if (status === "approved") {
          c = c.eq("onboarding_status", "approved").eq("activated", true);
        } else if (status === "pending_review") {
          c = c.eq("onboarding_status", "pending_review");
        } else if (status === "rejected") {
          c = c.eq("onboarding_status", "rejected");
        } else if (status === "deactivated") {
          c = c.eq("activated", false).not("deactivated_at", "is", null);
        }
        if (q) {
          const safe = q.replace(/[,()]/g, "");
          c = c.or(
            `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,external_id.ilike.%${safe}%,plate_number.ilike.%${safe}%`,
          );
        }
        const { count } = await c;
        return { count };
      })();

  const [{ data: drivers, error }, { count: countedTotal }] =
    await Promise.all([ranged, countQuery]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!drivers || drivers.length === 0) {
    return NextResponse.json({ drivers: [], total: 0 });
  }

  // Bulk-fetch documents for ALL drivers in this page in one query.
  const driverIds = drivers.map((d) => d.id);
  const { data: docs } = await supabase
    .from("driver_documents")
    .select("driver_id, status, previously_approved")
    .in("driver_id", driverIds);

  const docCountsByDriver = new Map<
    string,
    { approved: number; pending: number; rejected: number; missing: number; needsReview: boolean }
  >();
  for (const d of drivers) {
    docCountsByDriver.set(d.id, {
      approved: 0,
      pending: 0,
      rejected: 0,
      missing: 0,
      needsReview: false,
    });
  }
  for (const doc of docs ?? []) {
    const cur = docCountsByDriver.get(doc.driver_id);
    if (!cur) continue;
    if (doc.status === "approved") cur.approved++;
    else if (doc.status === "pending") cur.pending++;
    else if (doc.status === "rejected") cur.rejected++;
    else if (doc.status === "missing") cur.missing++;
    // Re-uploaded after a previous approval = needs admin re-review.
    if (doc.previously_approved && doc.status === "pending") {
      cur.needsReview = true;
    }
  }

  // Optional needs_review filter — applied here because it depends on
  // the joined doc data.
  let rows: DriverRow[] = drivers.map((d) => {
    const counts = docCountsByDriver.get(d.id) ?? {
      approved: 0,
      pending: 0,
      rejected: 0,
      missing: 0,
      needsReview: false,
    };
    return {
      id: d.id,
      externalId: d.external_id,
      userId: d.user_id,
      fullName:
        [d.first_name, d.last_name].filter(Boolean).join(" ") ||
        "Unnamed driver",
      email: d.email,
      phone: d.phone,
      plateNumber: d.plate_number,
      vehicle:
        [d.vehicle_color, d.vehicle_make, d.vehicle_model]
          .filter(Boolean)
          .join(" ") || null,
      parishOrRegion: null,
      onboardingStatus: d.onboarding_status,
      activated: d.activated,
      deactivatedAt: d.deactivated_at,
      createdAt: d.created_at,
      submittedAt: d.submitted_at,
      needsReview: counts.needsReview,
      docCounts: {
        approved: counts.approved,
        pending: counts.pending,
        rejected: counts.rejected,
        missing: counts.missing,
      },
    };
  });

  if (status === "needs_review") {
    rows = rows.filter((r) => r.needsReview);
  }

  // For ranged modes the true total is the count query result; for
  // the post-filter mode we report the filtered length so the chip on
  // the page still shows an accurate number.
  const total = isPostFilter ? rows.length : (countedTotal ?? rows.length);

  return NextResponse.json({ drivers: rows, total });
}
