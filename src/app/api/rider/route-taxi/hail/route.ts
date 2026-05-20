import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getWalletBalance } from "@/lib/wallet";
import { calculateRouteFare } from "@/lib/fare-engine";
import { isWithinJamaica } from "@/lib/jamaica";
import { notifyRouteTaxiDrivers } from "@/lib/notify";
import { getOutstandingLegalDocuments } from "@/lib/legal-consent";
import { sendRiderHailRequestedEmail } from "@/lib/email-templates";

/**
 * POST /api/rider/route-taxi/hail
 *
 * Rider hails a route taxi on a known TA route. Inserts a `route_hails`
 * row in `requested` state — the matcher (Phase 2) attaches it to the
 * next active driver session on the same route.
 *
 * Wallet gate: we refuse the hail if the rider doesn't have enough
 * balance to cover the fare. The actual debit happens at completion,
 * but blocking up front is the only way to honour the cashless rule
 * (no "pay later, hope it clears" gap).
 *
 * Body:
 *   { routeId: string, concession?: boolean }
 *
 * Pickup/dropoff names default to the route's origin/destination — the
 * "leg" override (rider boarding mid-route) lands in Phase 2.
 */
type RiderPlace = {
  name?: unknown;
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  parish?: unknown;
};

type HailBody = {
  routeId?: string;
  concession?: boolean;
  /** Rider's actual pickup (the Google Place they selected on the
   *  request page). When provided, we store the rider's name + coords
   *  rather than the route's named origin — drivers see the real
   *  pickup spot and the timeout fallback can prefill /rider/request. */
  pickup?: RiderPlace;
  /** Rider's actual dropoff. Same reasoning. */
  dropoff?: RiderPlace;
  /** Legacy params kept for back-compat with older clients. */
  pickupLat?: number;
  pickupLng?: number;
};

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Legal-consent gate: a rider may not hail a route taxi until they
  // have accepted every required policy at its current version. The
  // consent modal enforces this in the UI; this 403 is the
  // server-side guarantee.
  const outstandingLegal = await getOutstandingLegalDocuments(
    auth,
    user.id,
    "rider",
  );
  if (outstandingLegal.length > 0) {
    return NextResponse.json(
      {
        error: "legal_consent_required",
        message:
          "Review and accept RAJLO's updated policies before hailing a route taxi.",
        outstanding: outstandingLegal.map((d) => ({
          key: d.key,
          title: d.title,
        })),
      },
      { status: 403 },
    );
  }

  let body: HailBody;
  try {
    body = (await request.json()) as HailBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.routeId) {
    return NextResponse.json({ error: "routeId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_parish, destination_parish, distance_km, ta_fare_jmd",
    )
    .eq("id", body.routeId)
    .eq("active", true)
    .maybeSingle();

  if (routeError) {
    return NextResponse.json({ error: routeError.message }, { status: 500 });
  }
  if (!route) {
    return NextResponse.json({ error: "route not found" }, { status: 404 });
  }

  const distanceKm = Number(route.distance_km);
  const formulaFare = calculateRouteFare(distanceKm);
  const taFare = (route as { ta_fare_jmd: number }).ta_fare_jmd;
  const baseFare = taFare > 0 ? taFare : formulaFare;
  const concession = body.concession === true;
  const fareJmd = concession ? Math.round(baseFare / 2) : baseFare;

  // Resolve the actual pickup + dropoff. Prefer the full `pickup`/
  // `dropoff` Place objects from the new request flow; fall back to
  // legacy `pickupLat/pickupLng` for older clients; final fallback is
  // the route's named endpoints with no coords.
  //
  // Why this matters:
  //   • Driver map shows the rider's real pickup spot, not just
  //     "somewhere on this corridor".
  //   • Timeout fallback can deep-link the rider back into
  //     /rider/request with their original A→B prefilled.
  //   • Trip history can render where the rider actually went, not
  //     a generic corridor name.
  const riderPickup = pickPlace(body.pickup);
  const riderDropoff = pickPlace(body.dropoff);

  let pickupName = route.origin_name;
  let pickupLat = 0;
  let pickupLng = 0;
  let pickupParish: string | null = route.origin_parish;

  if (riderPickup) {
    pickupName = riderPickup.name || pickupName;
    pickupLat = riderPickup.lat;
    pickupLng = riderPickup.lng;
    pickupParish = riderPickup.parish ?? pickupParish;
  } else if (
    typeof body.pickupLat === "number" &&
    typeof body.pickupLng === "number" &&
    isWithinJamaica({ lat: body.pickupLat, lng: body.pickupLng })
  ) {
    pickupLat = body.pickupLat;
    pickupLng = body.pickupLng;
  }

  let dropoffName = route.destination_name;
  let dropoffLat = 0;
  let dropoffLng = 0;
  let dropoffParish: string | null = route.destination_parish;

  if (riderDropoff) {
    dropoffName = riderDropoff.name || dropoffName;
    dropoffLat = riderDropoff.lat;
    dropoffLng = riderDropoff.lng;
    dropoffParish = riderDropoff.parish ?? dropoffParish;
  }

  // Cashless gate. Don't let a hail leave the door if the rider can't
  // cover it — they'll be sent to the wallet top-up screen. We
  // return the actual `balanceJmd` so the client modal can show
  // "fare 220 / balance 90 / short by 130" instead of just a string.
  const walletBalanceJmd = await getWalletBalance(supabase, user.id);
  if (walletBalanceJmd < fareJmd) {
    return NextResponse.json(
      {
        error: "insufficient_balance",
        message: `Top up your wallet — this trip costs JMD $${fareJmd}.`,
        insufficientFunds: true,
        fareJmd,
        balanceJmd: walletBalanceJmd,
        requiredJmd: fareJmd,
      },
      { status: 402 },
    );
  }

  const { data: hail, error: hailError } = await supabase
    .from("route_hails")
    .insert({
      rider_id: user.id,
      route_id: route.id,
      session_id: null, // matcher attaches in Phase 2
      pickup_name: pickupName,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      pickup_parish: pickupParish,
      dropoff_name: dropoffName,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      dropoff_parish: dropoffParish,
      distance_km: distanceKm,
      fare_jmd: fareJmd,
      concession,
      status: "requested",
    })
    .select("id, status, fare_jmd, requested_at")
    .single();

  if (hailError || !hail) {
    return NextResponse.json(
      { error: hailError?.message ?? "failed to create hail" },
      { status: 500 },
    );
  }

  // Rider confirmation email — symmetrical with the private-ride
  // "we're finding your driver" send. Best-effort: don't roll back
  // the hail if email delivery hiccups.
  if (user.email) {
    const { data: riderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    void sendRiderHailRequestedEmail(user.email, {
      riderFirstName: riderProfile?.full_name ?? null,
      hailId: hail.id,
      routeOrigin: route.origin_name,
      routeDestination: route.destination_name,
      pickup: pickupName,
      dropoff: dropoffName,
      fareJMD: fareJmd,
    }).catch(() => null);
  }

  // Broadcast to every driver currently on this route. First one to
  // tap "Accept" wins via the atomic claim in
  // /api/driver/route-taxi/hails/[id]. Best-effort — a notification
  // failure must not roll back the hail (the rider's UI is already
  // polling and will reconcile if a driver accepts via in-app poll).
  void notifyRouteTaxiDrivers(supabase, route.id, {
    kind: "ride_available",
    title: "New route taxi hail",
    body: `${pickupName} → ${dropoffName} · JMD ${fareJmd.toLocaleString("en-JM")}`,
    href: "/driver/route-taxi",
    pushTag: `route-hail-${hail.id}`,
    pushRenotify: true,
    requireInteraction: true,
    pushOnly: true,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    hail: {
      id: hail.id,
      status: hail.status,
      fareJmd: hail.fare_jmd,
      requestedAt: hail.requested_at,
    },
    route: {
      id: route.id,
      origin: route.origin_name,
      destination: route.destination_name,
    },
  });
}

/**
 * Normalise an incoming Place-shaped object. Returns null when name +
 * coords are missing OR coords are outside Jamaica (we can't trust
 * stuck-on-zero / wrong-country fixes for storage).
 */
function pickPlace(p: unknown):
  | { name: string; address: string; lat: number; lng: number; parish: string | null }
  | null {
  if (!p || typeof p !== "object") return null;
  const obj = p as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const lat = Number(obj.lat);
  const lng = Number(obj.lng);
  if (!name) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isWithinJamaica({ lat, lng })) return null;
  return {
    name,
    address: typeof obj.address === "string" ? obj.address : "",
    lat,
    lng,
    parish: typeof obj.parish === "string" ? obj.parish : null,
  };
}
