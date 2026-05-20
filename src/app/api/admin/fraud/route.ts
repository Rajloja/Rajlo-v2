import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-auth";

/**
 * GET /api/admin/fraud
 *
 * Fraud dashboard data — gated by `view_fraud`:
 *   - riskUsers:        every account scored moderate-risk or above
 *   - openFlags:        unresolved fraud flags
 *   - openInvestigations: investigations not yet resolved/dismissed
 */

type ProfileRow = { id: string; full_name: string | null };

export async function GET() {
  const gate = await requirePermission("view_fraud");
  if (gate.error) return gate.error;
  const { supabase } = gate;

  // Triage dashboard — over-fetch each list by one to flag "more available"
  // without paginating inline. Caps stay tight on purpose.
  const SCORES_CAP = 40;
  const FLAGS_CAP = 50;
  const INVESTIGATIONS_CAP = 30;

  const [{ data: scores }, { data: flags }, { data: investigations }] =
    await Promise.all([
      supabase
        .from("fraud_risk_scores")
        .select("user_id, role, risk_score, risk_level, last_calculated_at")
        .gte("risk_score", 21)
        .order("risk_score", { ascending: false })
        .limit(SCORES_CAP + 1),
      supabase
        .from("fraud_flags")
        .select("id, user_id, flag_type, severity, description, created_at")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(FLAGS_CAP + 1),
      supabase
        .from("fraud_investigations")
        .select("id, user_id, status, summary, created_at")
        .in("status", ["open", "in_review"])
        .order("created_at", { ascending: false })
        .limit(INVESTIGATIONS_CAP + 1),
    ]);

  const scoreRows = scores ?? [];
  const flagRows = flags ?? [];
  const investigationRows = investigations ?? [];
  const hasMoreScores = scoreRows.length > SCORES_CAP;
  const hasMoreFlags = flagRows.length > FLAGS_CAP;
  const hasMoreInvestigations = investigationRows.length > INVESTIGATIONS_CAP;
  const trimmedScores = hasMoreScores ? scoreRows.slice(0, SCORES_CAP) : scoreRows;
  const trimmedFlags = hasMoreFlags ? flagRows.slice(0, FLAGS_CAP) : flagRows;
  const trimmedInvestigations = hasMoreInvestigations
    ? investigationRows.slice(0, INVESTIGATIONS_CAP)
    : investigationRows;

  // Resolve names for every user id referenced.
  const ids = new Set<string>();
  for (const r of trimmedScores) ids.add(r.user_id as string);
  for (const r of trimmedFlags) ids.add(r.user_id as string);
  for (const r of trimmedInvestigations) ids.add(r.user_id as string);
  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const { data: names } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...ids]);
    for (const p of (names ?? []) as ProfileRow[]) {
      nameById.set(p.id, p.full_name ?? "Unnamed user");
    }
  }
  const nameOf = (id: string) => nameById.get(id) ?? "Unknown user";

  return NextResponse.json({
    riskUsers: trimmedScores.map((s) => ({
      userId: s.user_id,
      name: nameOf(s.user_id as string),
      role: s.role,
      riskScore: s.risk_score,
      riskLevel: s.risk_level,
      lastCalculatedAt: s.last_calculated_at,
    })),
    openFlags: trimmedFlags.map((f) => ({
      id: f.id,
      userId: f.user_id,
      name: nameOf(f.user_id as string),
      flagType: f.flag_type,
      severity: f.severity,
      description: f.description,
      createdAt: f.created_at,
    })),
    openInvestigations: trimmedInvestigations.map((i) => ({
      id: i.id,
      userId: i.user_id,
      name: nameOf(i.user_id as string),
      status: i.status,
      summary: i.summary,
      createdAt: i.created_at,
    })),
    pagination: {
      hasMoreRiskUsers: hasMoreScores,
      hasMoreFlags,
      hasMoreInvestigations,
    },
  });
}
