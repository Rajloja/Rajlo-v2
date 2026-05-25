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

  // Diagnostic — returned alongside the quote so we can correlate
  // the rider's typed pickup with what the pathfinder projected
  // without digging through server logs. Inspect the Network tab
  // response in the browser when the UI shows "too far to hail" —
  // the fields below pinpoint whether it's a Place-geocoding issue
  // (rider's pickup landed offshore / on a side road) or a
  // projection bug (boarding point didn't land on the corridor
  // polyline).
  const debug = {
    pickup: { lat: pickup.lat, lng: pickup.lng },
    dropoff: { lat: dropoff.lat, lng: dropoff.lng },
    boarding: full.boarding,
    alighting: full.alighting,
    hailable: full.hailable,
    corridor: full.boarding.corridorLabel,
    legs: full.legCount,
  };

  if (!full.hailable) {
    console.log(
      `[route-quote] not_hailable pickup=(${pickup.lat.toFixed(5)},${pickup.lng.toFixed(5)}) ` +
        `dropoff=(${dropoff.lat.toFixed(5)},${dropoff.lng.toFixed(5)}) ` +
        `boarding=(${full.boarding.coords.lat.toFixed(5)},${full.boarding.coords.lng.toFixed(5)}) ` +
        `boardingWalkKm=${full.boarding.walkKm.toFixed(2)} ` +
        `alighting=(${full.alighting.coords.lat.toFixed(5)},${full.alighting.coords.lng.toFixed(5)}) ` +
        `alightingWalkKm=${full.alighting.walkKm.toFixed(2)} ` +
        `corridor="${full.boarding.corridorLabel}" legs=${full.legCount}`,
    );
  }

  return NextResponse.json({
    journey: full,
    concession: concession ?? null,
    _debug: debug,
  });
}
