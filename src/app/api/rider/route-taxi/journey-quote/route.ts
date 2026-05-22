import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { findRouteTaxiPath } from "@/lib/route-taxi-pathfinder";
import { isWithinJamaica } from "@/lib/jamaica";

/**
 * POST /api/rider/route-taxi/journey-quote
 *
 * Quote a Route Taxi journey from a free-form pickup → dropoff (lat/
 * lng pair). The pathfinder snaps to the nearest corridor endpoints
 * and runs Dijkstra over the corridor graph to find the cheapest
 * route — single-leg when a direct corridor exists, multi-leg
 * otherwise.
 *
 * Returns:
 *   { journey: { legs[], totalFareJmd, totalDistanceKm, legCount,
 *                pickupSnap, dropoffSnap }, concession?: { ... } }
 *   { journey: null }  when no route taxi path exists within snap
 *                      radius / leg cap — the rider's only option is
 *                      a private ride
 *
 * The `/rider/request` booking surface calls this alongside the
 * private-ride quote so the rider can compare totals before choosing.
 */

type Place = {
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Body = {
  pickup?: Place;
  dropoff?: Place;
  concession?: boolean;
};

function readPlace(p: Place | undefined): {
  name?: string | null;
  lat: number;
  lng: number;
} | null {
  if (!p) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isWithinJamaica({ lat, lng })) return null;
  return { name: p.name ?? null, lat, lng };
}

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const pickup = readPlace(body.pickup);
  const dropoff = readPlace(body.dropoff);
  if (!pickup || !dropoff) {
    return NextResponse.json(
      {
        error:
          "pickup and dropoff each require numeric { lat, lng } within Jamaica",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  // Compute the full-fare quote and (if applicable) the concession
  // quote in parallel. The pathfinder reads from a 5-minute cache so
  // the second call is effectively free.
  const [full, concession] = await Promise.all([
    findRouteTaxiPath(supabase, {
      pickup,
      dropoff,
      concession: false,
    }),
    body.concession
      ? findRouteTaxiPath(supabase, {
          pickup,
          dropoff,
          concession: true,
        })
      : Promise.resolve(null),
  ]);

  if (!full) {
    return NextResponse.json({
      journey: null,
      reason:
        "No route taxi corridor chain reaches that pickup or dropoff within walking distance.",
    });
  }

  return NextResponse.json({
    journey: full,
    concession: concession ?? null,
  });
}
