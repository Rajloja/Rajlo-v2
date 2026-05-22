/**
 * Predictive transfer-driver matcher.
 *
 * When a multi-leg route taxi journey advances to its next leg, the
 * system needs to find drivers on the next corridor who can pick up
 * the rider at the transfer point. We can't reserve a seat in advance
 * — route taxis don't wait. Instead, this matcher:
 *
 *   1. Finds active driver sessions on the target corridor with a
 *      free seat.
 *   2. Among those, ranks by proximity to the transfer point (lower
 *      haversine = better — they're already nearby and likely to
 *      pass through soon).
 *   3. Returns a candidate list the caller can broadcast to.
 *
 * The actual driver-rider lock happens at QR scan
 * (/api/rider/route-taxi/journeys/[id]/claim) — never at broadcast.
 * If a candidate driver scrolls past or fills up before the rider
 * arrives, the rebroadcast picks someone else without anyone waiting.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "@/lib/jamaica";

/** Max distance from the transfer point we'll consider a candidate. */
export const TRANSFER_NEARBY_KM = 15;

/** Max candidates returned (also the size of the "priority" notify slice). */
export const TRANSFER_CANDIDATE_CAP = 8;

export type TransferCandidate = {
  sessionId: string;
  driverId: string;
  driverUserId: string;
  seatsTaken: number;
  vehicleCapacity: number;
  currentLat: number | null;
  currentLng: number | null;
  /** Haversine km from session position to transfer point. Infinity
   *  for sessions without a current GPS fix — they're still
   *  candidates (corridor + free seat) but ranked last. */
  distanceKm: number;
};

type SessionRow = {
  id: string;
  driver_id: string;
  seats_taken: number;
  vehicle_capacity: number;
  current_lat: number | null;
  current_lng: number | null;
};

/**
 * Find drivers actively running the target corridor with a free seat,
 * sorted by proximity to the transfer point. Returns up to
 * TRANSFER_CANDIDATE_CAP candidates with their user_id resolved so
 * the caller can push to each driver directly.
 *
 * Caller filters to whatever they consider "close enough" — by default
 * we cap at TRANSFER_NEARBY_KM but also include any GPS-less session
 * on the corridor so they don't silently drop out of the broadcast.
 */
export async function findTransferCandidates(
  supabase: SupabaseClient,
  args: {
    /** Next leg's corridor — sessions must be running this route. */
    routeId: string;
    /** Where the rider will alight from the current leg. */
    transferLat: number | null;
    transferLng: number | null;
    /** Override the proximity cap (km). Use Infinity to include every
     *  active driver on the corridor regardless of GPS. */
    maxKm?: number;
  },
): Promise<TransferCandidate[]> {
  const { data: sessions } = await supabase
    .from("driver_sessions")
    .select(
      "id, driver_id, seats_taken, vehicle_capacity, current_lat, current_lng",
    )
    .eq("route_id", args.routeId)
    .eq("status", "active");

  const rows = (sessions ?? []) as SessionRow[];
  if (rows.length === 0) return [];

  // Filter by free seat first — full vehicle can't take a transfer.
  const withFreeSeats = rows.filter(
    (s) => s.seats_taken < s.vehicle_capacity,
  );
  if (withFreeSeats.length === 0) return [];

  // Compute distance to transfer point. If we don't know the transfer
  // point coords, treat all candidates as equally far away — they'll
  // all surface in the broadcast, just unsorted.
  const haveTransferCoords =
    typeof args.transferLat === "number" &&
    typeof args.transferLng === "number" &&
    Number.isFinite(args.transferLat) &&
    Number.isFinite(args.transferLng);
  const maxKm = args.maxKm ?? TRANSFER_NEARBY_KM;

  const scored: Array<SessionRow & { distanceKm: number }> = withFreeSeats.map(
    (s) => {
      if (
        haveTransferCoords &&
        s.current_lat != null &&
        s.current_lng != null
      ) {
        return {
          ...s,
          distanceKm: haversineKm(
            { lat: args.transferLat as number, lng: args.transferLng as number },
            { lat: s.current_lat, lng: s.current_lng },
          ),
        };
      }
      return { ...s, distanceKm: Infinity };
    },
  );

  // Filter by proximity — but keep GPS-less drivers as a fallback
  // tail so we don't disqualify someone running the corridor just
  // because their app hasn't posted a fix yet.
  const inRange = scored.filter(
    (s) => s.distanceKm <= maxKm || !Number.isFinite(s.distanceKm),
  );
  inRange.sort((a, b) => a.distanceKm - b.distanceKm);
  const top = inRange.slice(0, TRANSFER_CANDIDATE_CAP);
  if (top.length === 0) return [];

  // Resolve driver_id → user_id so the caller can push to them. One
  // batched lookup keeps the round-trips bounded.
  const driverIds = Array.from(new Set(top.map((s) => s.driver_id)));
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, user_id")
    .in("id", driverIds)
    .eq("activated", true)
    .is("deactivated_at", null)
    .not("user_id", "is", null);

  const userIdByDriverId = new Map(
    ((drivers ?? []) as Array<{ id: string; user_id: string | null }>)
      .filter((d) => d.user_id)
      .map((d) => [d.id, d.user_id as string]),
  );

  return top
    .filter((s) => userIdByDriverId.has(s.driver_id))
    .map((s) => ({
      sessionId: s.id,
      driverId: s.driver_id,
      driverUserId: userIdByDriverId.get(s.driver_id) as string,
      seatsTaken: s.seats_taken,
      vehicleCapacity: s.vehicle_capacity,
      currentLat: s.current_lat,
      currentLng: s.current_lng,
      distanceKm: s.distanceKm,
    }));
}
