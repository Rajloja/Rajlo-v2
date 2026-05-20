import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/driver/notifications
 *
 * Returns the driver's notification feed, most-recent first.
 *
 * Pagination: `?limit=` (1..50, default 30) + `?offset=` (default 0).
 * Response carries `pagination.hasMore` so the page can show / hide
 * the Load-more button without a separate count query. Includes
 * `unreadCount` so the inbox header can render the badge without a
 * second round-trip.
 *
 * Mirrors `/api/rider/notifications` exactly so the two inbox UIs
 * share the same shape.
 */

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  // Over-fetch by one to compute `hasMore` without a separate count
  // query. If we get back `limit + 1` rows we know there's another
  // page; we return the first `limit` of them to the client.
  const [{ data: rowsRaw, error }, { count }] = await Promise.all([
    supabase
      .from("driver_notifications")
      .select("id, kind, title, body, href, cta, read_at, created_at")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit),
    supabase
      .from("driver_notifications")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", user.id)
      .is("read_at", null),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = rowsRaw ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    notifications: page.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      cta: n.cta,
      read: n.read_at !== null,
      at: n.created_at,
    })),
    pagination: { hasMore },
    unreadCount: count ?? 0,
  });
}

/**
 * POST /api/driver/notifications
 *
 * Bulk mark-all-as-read. Payload-less + idempotent.
 */
export async function POST() {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const { error } = await supabase
    .from("driver_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("driver_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
