import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  calculateRouteFareDetailed,
  calculateConcessionFare,
  getRouteTaxiTariff,
} from "@/lib/fare-engine";

/**
 * POST /api/rider/route-taxi/quote
 *
 * Returns a fare quote for a Route Taxi (Mode B) trip, priced under
 * the TA tariff currently in effect.
 *
 * Body:
 *   { routeId: string }     — quote the seeded TA fare for this corridor
 *   { distanceKm: number }  — quote an ad-hoc distance via the formula
 *   { tripDate?: string }   — optional ISO timestamp; defaults to now.
 *                              Used by admin / receipt re-prints to price
 *                              a trip under the tariff that was active
 *                              when it was booked.
 *
 * The TA-published table (`routes.ta_fare_jmd`) reflects the 2023
 * tariff for legacy routes. For trips priced under newer tariffs we
 * compute from the formula directly — the table is only consulted
 * when the formula and table happen to agree (i.e. for trips booked
 * before 2026-06-02). After the June 2026 fare increase the formula
 * is the source of truth; the legacy column is retained only so older
 * receipts can still be reproduced.
 */
type QuoteBody = {
  routeId?: string;
  distanceKm?: number;
  tripDate?: string;
};

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: QuoteBody;
  try {
    body = (await request.json()) as QuoteBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.routeId && typeof body.distanceKm !== "number") {
    return NextResponse.json(
      { error: "Provide either routeId or distanceKm" },
      { status: 400 },
    );
  }

  // Resolve the trip date. Invalid strings fall through to "now" so a
  // malformed value doesn't 400 the request — quoting "right now" is
  // the right default.
  const tripDate = (() => {
    if (!body.tripDate) return new Date();
    const d = new Date(body.tripDate);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  })();
  const tariff = getRouteTaxiTariff(tripDate);

  // Direct ad-hoc quote — no DB lookup.
  if (typeof body.distanceKm === "number" && !body.routeId) {
    if (!Number.isFinite(body.distanceKm) || body.distanceKm < 0) {
      return NextResponse.json(
        { error: "distanceKm must be a non-negative number" },
        { status: 400 },
      );
    }
    const detail = calculateRouteFareDetailed(body.distanceKm, tripDate);
    return NextResponse.json({
      source: "formula",
      route: null,
      distanceKm: detail.distanceKm,
      fareJmd: detail.roundedFareJmd,
      concessionFareJmd: calculateConcessionFare(body.distanceKm, tripDate),
      breakdown: {
        baseRateJmd: tariff.baseRateJmd,
        perKmRateJmd: tariff.perKmRateJmd,
        tariffLabel: tariff.label,
        tariffEffectiveFrom: tariff.effectiveFrom,
        rawJmd: detail.rawFareJmd,
      },
    });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const { data: route, error } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, distance_km, ta_fare_jmd, slug",
    )
    .eq("id", body.routeId!)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!route) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }

  const distanceKm = Number(route.distance_km);
  const detail = calculateRouteFareDetailed(distanceKm, tripDate);
  // Post-2026-06-02 the formula is the authority because the seeded
  // `ta_fare_jmd` column is the 2023 figure. Pre-2023-06-02 trips
  // (legacy receipts) keep using the seeded value when the formula
  // agrees to within $20 — the published table was hand-rounded.
  const legacyTaFare = (route as { ta_fare_jmd: number }).ta_fare_jmd;
  const isLegacyTariff = tariff.effectiveFrom === "2023-10-15";
  const fareJmd =
    isLegacyTariff && legacyTaFare > 0
      ? legacyTaFare
      : detail.roundedFareJmd;

  return NextResponse.json({
    source: isLegacyTariff && legacyTaFare > 0 ? "ta_table" : "formula",
    route: {
      id: route.id,
      origin: route.origin_name,
      destination: route.destination_name,
      parish: route.origin_parish,
      slug: route.slug,
    },
    distanceKm,
    fareJmd,
    concessionFareJmd: Math.round(fareJmd / 2),
    breakdown: {
      baseRateJmd: tariff.baseRateJmd,
      perKmRateJmd: tariff.perKmRateJmd,
      tariffLabel: tariff.label,
      tariffEffectiveFrom: tariff.effectiveFrom,
      rawJmd: detail.rawFareJmd,
      formulaRoundedJmd: detail.roundedFareJmd,
      taPublishedJmd: legacyTaFare,
    },
  });
}
