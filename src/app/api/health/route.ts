import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/health
 *
 * Public liveness + DB reachability check for uptime monitoring
 * (Better Uptime, UptimeRobot, Sentry Cron Monitor, etc.). Cheap
 * enough to poll every minute — no writes, one bounded read against
 * a system table, no auth.
 *
 * Returns:
 *   200 { ok: true, db: "up", ts, uptimeSec } — everything reachable
 *   503 { ok: false, db: "down" | "unconfigured", error, ts }
 *
 * Uptime monitors that only support "status < 400" will read that
 * signal correctly; monitors that read the JSON body get a richer
 * "which component is broken" picture. The Vercel edge → Next.js →
 * Supabase network path is exercised end-to-end, so an issue in any
 * hop surfaces here first.
 *
 * Deliberately NOT gated behind auth. The response body only exposes
 * "am I reachable" and "is the DB reachable" — no PII, no counts, no
 * schema information. Anyone can poll this; there's nothing to leak.
 *
 * `dynamic = "force-dynamic"` prevents Next.js from serving a cached
 * response — a monitor calling every 60 s must actually hit the DB
 * every time, not read a stale success from the last deploy.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOOT_TIME_MS = Date.now();

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        db: "unconfigured",
        error: "Supabase service role not configured",
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  const start = Date.now();
  // Cheap, always-present table with a bounded read. Selecting HEAD-only
  // with `count: "exact", head: true` fetches a single row-count round
  // trip — no bytes over the wire beyond the count itself. Any error
  // (network, auth, RLS misconfig, schema drift) fails LOUDLY.
  const { error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .limit(1);
  const dbLatencyMs = Date.now() - start;

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: error.message.slice(0, 200),
        dbLatencyMs,
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    db: "up",
    dbLatencyMs,
    uptimeSec: Math.round((Date.now() - BOOT_TIME_MS) / 1000),
    ts: new Date().toISOString(),
    // Vercel injects VERCEL_ENV automatically. Local dev shows undefined.
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  });
}
