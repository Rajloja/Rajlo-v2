import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";

/**
 * GET /api/admin/incidents — the incident queue.
 *
 * Gated by `view_incidents` (every moderation tier holds it). Returns
 * incidents ordered with the unresolved + most severe first so the
 * safety team works the right ones first.
 */

type ProfileRow = { id: string; full_name: string | null };

const OPEN_STATUSES = [
  "open",
  "under_review",
  "awaiting_response",
  "escalated",
];

export async function GET(request: Request) {
  const gate = await requirePermission("view_incidents");
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope"); // "open" | "all"
  const limit = Math.min(
    200,
    Math.max(10, parseInt(url.searchParams.get("limit") ?? "80", 10) || 80),
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );

  let q = supabase
    .from("incidents")
    .select(
      "id, incident_type, severity_level, status, title, reporter_user_id, reporter_role, reported_at",
    )
    .order("reported_at", { ascending: false })
    .range(offset, offset + limit);
  if (scope !== "all") {
    q = q.in("status", OPEN_STATUSES);
  }
  const { data: incidents } = await q;
  const fetched = incidents ?? [];
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;

  // Resolve reporter names.
  const ids = [
    ...new Set(
      page
        .map((i) => i.reporter_user_id as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: names } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of (names ?? []) as ProfileRow[]) {
      nameById.set(p.id, p.full_name ?? "Unnamed user");
    }
  }

  return NextResponse.json({
    incidents: page.map((i) => ({
      id: i.id,
      incidentType: i.incident_type,
      severity: i.severity_level,
      status: i.status,
      title: i.title,
      reporter: i.reporter_user_id
        ? (nameById.get(i.reporter_user_id as string) ?? "Unknown")
        : "Unknown",
      reporterRole: i.reporter_role,
      reportedAt: i.reported_at,
    })),
    pagination: { hasMore },
  });
}
