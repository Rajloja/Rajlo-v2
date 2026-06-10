/**
 * Rajlo fare engine — Route Taxi (Mode B).
 *
 * Single source of truth for every Route Taxi quote in the platform.
 * Anchored to the Transport Authority of Jamaica's published fare
 * schedule (see `/public/ROUTE TAXI FARE INCREASE 2026 Updated - June 4.pdf`).
 *
 * Tariff history:
 *   - 2023-10-15 → 2026-06-01: base $113, per-km $7.00 (TA 2023)
 *   - 2026-06-02 → 2026-06-30: base $122, per-km $7.56 (+8%, Phase 1)
 *   - 2026-07-01 onwards:      base $132, per-km $8.64 (+8%, Phase 2)
 *
 * The TA notice publishes worked examples for each phase that the
 * engine MUST reproduce exactly — see `scripts/verify-fare-engine.mjs`.
 *
 * To add a future tariff change: append a new entry to
 * `ROUTE_TAXI_TARIFFS` (ordered oldest → newest by `effectiveFrom`)
 * and update the verify script with the new worked example. Every
 * caller passes the trip date in, so historical quotes keep returning
 * the rate that was in effect at the time the trip was booked /
 * receipted — no retroactive re-pricing.
 *
 * Mode A (Private Ride) uses a separate calculation — never reuse this
 * function for it.
 */

export type RouteTaxiTariff = {
  /** ISO date (YYYY-MM-DD) the tariff takes effect, inclusive. */
  effectiveFrom: string;
  /** Display label — surfaced on receipts + the rider fare breakdown. */
  label: string;
  /** Flag-fall — covers the first kilometre of every route taxi trip. */
  baseRateJmd: number;
  /** Per-kilometre rate added on top of the base. */
  perKmRateJmd: number;
};

/**
 * Every TA route-taxi tariff Rajlo has supported, ordered from oldest
 * to newest by `effectiveFrom`. Add new entries by appending — never
 * mutate or reorder existing entries (historical trips need to find
 * the tariff that was in effect when they were booked).
 */
export const ROUTE_TAXI_TARIFFS: ReadonlyArray<RouteTaxiTariff> = [
  {
    effectiveFrom: "2023-10-15",
    label: "TA 2023",
    baseRateJmd: 113,
    perKmRateJmd: 7.0,
  },
  {
    effectiveFrom: "2026-06-02",
    label: "TA 2026 · Phase 1",
    baseRateJmd: 122,
    perKmRateJmd: 7.56,
  },
  {
    effectiveFrom: "2026-07-01",
    label: "TA 2026 · Phase 2",
    baseRateJmd: 132,
    perKmRateJmd: 8.64,
  },
];

/**
 * The TA quotes every fare to the nearest $10 (so $215 → $220, $214 →
 * $210). A passenger or inspector wouldn't compute anything finer.
 * This rule has held across all three tariff phases, so it lives at
 * module scope rather than per-tariff.
 */
export const ROUTE_TAXI_ROUNDING_JMD = 10;

/**
 * Resolve the tariff in effect for a given trip date. Defaults to
 * `new Date()` — i.e. live-quote callers don't need to think about
 * which tariff applies.
 *
 * Walks the tariff list newest-first and returns the first entry
 * whose `effectiveFrom` is on or before `tripDate`. Returns the
 * oldest tariff as a safety net for dates earlier than 2023 (which
 * realistically won't happen — Rajlo didn't exist then — but the
 * function never returns null so callers don't need null checks).
 */
export function getRouteTaxiTariff(
  tripDate: Date = new Date(),
): RouteTaxiTariff {
  const ts = tripDate.getTime();
  for (let i = ROUTE_TAXI_TARIFFS.length - 1; i >= 0; i--) {
    const t = ROUTE_TAXI_TARIFFS[i];
    if (new Date(t.effectiveFrom + "T00:00:00").getTime() <= ts) {
      return t;
    }
  }
  return ROUTE_TAXI_TARIFFS[0];
}

/**
 * Compute the regulated route taxi fare for a trip of `distanceKm`
 * priced under the tariff in effect on `tripDate` (defaults to now).
 *
 *   fare = round10( BASE_RATE + (distance × RATE_PER_KM) )
 *
 * Worked examples (each MUST hold under its corresponding tariff):
 *   2023 phase   · 15 km → 113 + 105.00 = 218.00  → **$220**
 *   2026-06 phase · 15 km → 122 + 113.40 = 235.40  → **$240**
 *   2026-07 phase · 15 km → 132 + 129.60 = 261.60  → **$260**
 *
 * Rounding is half-up at the $5 boundary so a fare of $215 returns
 * $220 — matching how a human cashier quotes it. Banker's rounding
 * would silently give $210 for the same input, which is wrong against
 * the published table.
 *
 * Throws if `distanceKm` is negative or non-finite. A zero-distance
 * trip is technically valid (the base rate stands) — used for the
 * "minimum charge" surface in the rider quote UI.
 */
export function calculateRouteFare(
  distanceKm: number,
  tripDate: Date = new Date(),
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error(
      `calculateRouteFare: distanceKm must be a finite, non-negative number (got ${distanceKm})`,
    );
  }
  const tariff = getRouteTaxiTariff(tripDate);
  const raw = tariff.baseRateJmd + distanceKm * tariff.perKmRateJmd;
  return roundHalfUpToMultiple(raw, ROUTE_TAXI_ROUNDING_JMD);
}

/**
 * Returns the unrounded fare alongside the rounded one PLUS the tariff
 * that produced it. Useful for the rider's fare-breakdown screen so
 * they can see both the maths and which tariff is in effect.
 */
export function calculateRouteFareDetailed(
  distanceKm: number,
  tripDate: Date = new Date(),
): {
  tariff: RouteTaxiTariff;
  distanceKm: number;
  rawFareJmd: number;
  roundedFareJmd: number;
} {
  const tariff = getRouteTaxiTariff(tripDate);
  const raw = tariff.baseRateJmd + distanceKm * tariff.perKmRateJmd;
  return {
    tariff,
    distanceKm,
    rawFareJmd: raw,
    roundedFareJmd: roundHalfUpToMultiple(raw, ROUTE_TAXI_ROUNDING_JMD),
  };
}

/**
 * TA grants half-fare to: children, students in uniform, physically
 * disabled, senior citizens. Exposed as a separate helper because the
 * concession is computed AFTER rounding the regular fare, then itself
 * snapped back to the nearest dollar (TA doesn't quote fractions).
 */
export function calculateConcessionFare(
  distanceKm: number,
  tripDate: Date = new Date(),
): number {
  const full = calculateRouteFare(distanceKm, tripDate);
  return Math.round(full / 2);
}

/**
 * Round-half-up to the nearest multiple of `step`. The standard
 * `Math.round` does banker's rounding for .5 in some engines and is
 * half-away-from-zero otherwise — neither matches the TA cashier
 * convention. We add 0.5 explicitly so 215 always rounds up to 220.
 */
function roundHalfUpToMultiple(value: number, step: number): number {
  return Math.floor(value / step + 0.5) * step;
}

/* ────────────────────── Commission split ──────────────────────
 * Rajlo's take on every completed trip — split between driver
 * earnings and platform commission. Applies to both Mode A and
 * Mode B (the percentage may diverge later if route taxi vs
 * private ride economics call for it).
 *
 * Stored as an integer percent so the JSON serialisation / admin
 * dashboards / driver "what you'll earn" copy all read the same
 * canonical number.
 */
export const RAJLO_COMMISSION_PCT = 15;

/**
 * Split a fare into `{ driverEarningsJmd, commissionJmd }`.
 *
 * Commission rounds to the nearest dollar (we never quote anything
 * finer than $1 to drivers). Driver earnings = fare − commission so
 * the two halves always sum to the gross — no penny-leaking edge
 * cases.
 */
export function splitFare(fareJmd: number): {
  driverEarningsJmd: number;
  commissionJmd: number;
} {
  if (!Number.isFinite(fareJmd) || fareJmd < 0) {
    throw new Error(
      `splitFare: fareJmd must be a non-negative number (got ${fareJmd})`,
    );
  }
  const commission = Math.round((fareJmd * RAJLO_COMMISSION_PCT) / 100);
  return {
    driverEarningsJmd: fareJmd - commission,
    commissionJmd: commission,
  };
}
