import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { calculateRouteFare } from "@/lib/fare-engine";

/**
 * /api/admin/routes
 *
 * GET   — list every route (active + inactive) with filters
 * POST  — create a new TA-licensed corridor
 *
 * The seed script covers ~466 corridors out of the ~600 in the TA 2023
 * PDF; admin uses this surface to fill the gaps the parser couldn't
 * extract cleanly + maintain the catalogue going forward.
 */

type RouteRow = {
  id: string;
  origin: string;
  destination: string;
  parish: string | null;
  distanceKm: number;
  taFareJmd: number;
  formulaFareJmd: number;
  active: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const parish = url.searchParams.get("parish")?.trim();
  const activeParam = url.searchParams.get("active");
  const limit = Math.min(
    500,
    Math.max(20, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200),
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
  );

  // Catalogue-wide active/total counts come from a separate count
  // query so pagination doesn't distort the header — admins want
  // "X of Y active" across the full filtered set, not the page.
  let countQuery = supabase
    .from("routes")
    .select("active", { count: "exact" });
  let activeCountQuery = supabase
    .from("routes")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if (parish) {
    countQuery = countQuery.eq("origin_parish", parish);
    activeCountQuery = activeCountQuery.eq("origin_parish", parish);
  }
  if (activeParam === "true") {
    countQuery = countQuery.eq("active", true);
  } else if (activeParam === "false") {
    countQuery = countQuery.eq("active", false);
  }
  if (q) {
    const safe = q.replace(/[,()]/g, "");
    countQuery = countQuery.or(
      `origin_name.ilike.%${safe}%,destination_name.ilike.%${safe}%`,
    );
    activeCountQuery = activeCountQuery.or(
      `origin_name.ilike.%${safe}%,destination_name.ilike.%${safe}%`,
    );
  }

  let query = supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, distance_km, ta_fare_jmd, slug, active, created_at, updated_at",
    )
    .order("origin_parish", { ascending: true, nullsFirst: false })
    .order("origin_name", { ascending: true })
    .range(offset, offset + limit);

  if (parish) query = query.eq("origin_parish", parish);
  if (activeParam === "true") query = query.eq("active", true);
  if (activeParam === "false") query = query.eq("active", false);
  if (q) {
    const safe = q.replace(/[,()]/g, "");
    query = query.or(
      `origin_name.ilike.%${safe}%,destination_name.ilike.%${safe}%`,
    );
  }

  const [{ data, error }, totalRes, activeRes] = await Promise.all([
    query,
    countQuery,
    activeCountQuery,
  ]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fetched = data ?? [];
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;

  const routes: RouteRow[] = page.map((r) => {
    const distance = Number(r.distance_km);
    return {
      id: r.id,
      origin: r.origin_name,
      destination: r.destination_name,
      parish: r.origin_parish,
      distanceKm: distance,
      taFareJmd: r.ta_fare_jmd,
      formulaFareJmd: calculateRouteFare(distance),
      active: r.active,
      slug: r.slug,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  return NextResponse.json({
    routes,
    totalCount: totalRes.count ?? routes.length,
    activeCount: activeRes.count ?? routes.filter((r) => r.active).length,
    pagination: { hasMore },
  });
}

type CreateBody = {
  origin?: string;
  destination?: string;
  parish?: string;
  distanceKm?: number;
  taFareJmd?: number;
  active?: boolean;
};

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const origin = (body.origin ?? "").trim();
  const destination = (body.destination ?? "").trim();
  const distance = Number(body.distanceKm);

  if (!origin || !destination) {
    return NextResponse.json(
      { error: "Origin and destination are required." },
      { status: 400 },
    );
  }
  if (origin.toLowerCase() === destination.toLowerCase()) {
    return NextResponse.json(
      { error: "Origin and destination must differ." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(distance) || distance <= 0 || distance > 250) {
    return NextResponse.json(
      { error: "Distance must be a positive number, max 250 km." },
      { status: 400 },
    );
  }
  // If the admin didn't supply a TA fare, fall back to the formula.
  // This keeps the row populated for routes the TA hasn't published —
  // the formula is the regulated default.
  const formulaFare = calculateRouteFare(distance);
  const taFare =
    typeof body.taFareJmd === "number" && body.taFareJmd > 0
      ? Math.round(body.taFareJmd)
      : formulaFare;

  const slug = makeSlug(`${origin}-to-${destination}`);

  const { data: created, error } = await supabase
    .from("routes")
    .insert({
      origin_name: origin,
      destination_name: destination,
      origin_parish: body.parish ?? null,
      destination_parish: body.parish ?? null,
      distance_km: distance,
      ta_fare_jmd: taFare,
      slug,
      active: body.active !== false,
    })
    .select("id, slug")
    .single();

  if (error) {
    const isDuplicate = error.code === "23505";
    return NextResponse.json(
      {
        error: isDuplicate
          ? `Route ${origin} → ${destination} already exists.`
          : error.message,
      },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  void logAdminAction(supabase, actor, {
    targetType: "system",
    targetId: created.id,
    targetLabel: `${origin} → ${destination}`,
    action: "route.create",
    summary: `Added route ${origin} → ${destination} (${distance} km, JMD $${taFare})`,
  });

  return NextResponse.json({ ok: true, route: { id: created.id, slug } });
}

function makeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
