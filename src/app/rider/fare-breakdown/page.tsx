"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { FARE_CONFIG, estimateFare, formatJMD } from "@/lib/jamaica";
import { formatEta } from "@/lib/format-eta";
import {
  calculateRouteFare,
  calculateConcessionFare,
  getRouteTaxiTariff,
} from "@/lib/fare-engine";

/**
 * Rider fare-breakdown explainer. Doubles as a calculator —
 * sliders for distance + stops + seats produce a live estimate
 * using the actual fare config that the booking flow uses, so what
 * the rider sees here matches their next trip exactly.
 *
 * Goal of the page: make pricing legible. No surprises at booking
 * time, no "what does Rajlo charge" doubt at trip start.
 */

export default function RiderFareBreakdownPage() {
  // Mode tab — private ride uses the metered estimator; route taxi
  // uses the TA fare engine (base + km × per-km, rounded to nearest
  // $10). Base and per-km come from the live tariff (`fare-engine`),
  // so a tariff change automatically reflects here.
  const [mode, setMode] = useState<"private" | "route_taxi">("private");
  const [distanceKm, setDistanceKm] = useState(8);
  const [stops, setStops] = useState(0);
  const [seats, setSeats] = useState(1);
  const [carpool, setCarpool] = useState(false);
  const [concession, setConcession] = useState(false);

  // Manufacture a synthetic point list that haversine'd would equal
  // the slider distance. Two points at the right great-circle gap
  // does the trick — direction doesn't matter for fare maths.
  const fakePoints = useMemo(() => {
    const list: { lat: number; lng: number }[] = [];
    list.push({ lat: 18.0, lng: -77.0 });
    // 1 deg of lat ≈ 111 km. Convert km → degrees, divided by 1.25
    // because estimateFare multiplies the haversine by the
    // road-network factor.
    const dLat = distanceKm / 1.25 / 111;
    for (let i = 0; i < stops; i++) {
      list.push({ lat: 18.0 + (dLat * (i + 1)) / (stops + 1), lng: -77.0 });
    }
    list.push({ lat: 18.0 + dLat, lng: -77.0 });
    return list;
  }, [distanceKm, stops]);

  const fare = useMemo(
    () => estimateFare(fakePoints, seats),
    [fakePoints, seats],
  );

  const carpoolFare = Math.max(
    400,
    Math.round((fare.fareJMD * 0.65) / 50) * 50,
  );
  const displayedFare = carpool ? carpoolFare : fare.fareJMD;
  const carpoolSavings = fare.fareJMD - carpoolFare;

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-red p-6 text-white shadow-xl shadow-rajlo-red/30 md:p-8">
          <ArcWatermark
            size={420}
            variant="white"
            className="absolute -right-24 -bottom-32 opacity-[0.10]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
              Pricing
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              How fares work
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/85">
              Transparent, predictable, and the same maths every time. Slide the
              controls to see what your next trip would cost.
            </p>
          </div>
        </div>
      </FadeUp>

      {/* Mode tabs — let the rider switch between Private Ride
         (metered, multi-stop) and Route Taxi (TA-regulated single-leg)
         estimators without leaving the page. */}
      <FadeUp delay={0.05}>
        <div className="inline-flex rounded-full border border-line bg-surface p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMode("private")}
            className={`rounded-full px-4 py-2 transition-colors ${
              mode === "private"
                ? "bg-rajlo-red text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Private Ride
          </button>
          <button
            type="button"
            onClick={() => setMode("route_taxi")}
            className={`rounded-full px-4 py-2 transition-colors ${
              mode === "route_taxi"
                ? "bg-rajlo-red text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Route Taxi
          </button>
        </div>
      </FadeUp>

      {/* Calculator */}
      <FadeUp delay={0.06}>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lg shadow-rajlo-red/[0.04]">
          {mode === "private" ? (
          <>
          <div className="bg-surface-soft px-6 py-5">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
              Estimated fare · Private Ride
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <p className="text-4xl font-extrabold tracking-tight text-rajlo-red md:text-5xl">
                {formatJMD(displayedFare)}
              </p>
              {carpool && carpoolSavings > 0 && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  Save {formatJMD(carpoolSavings)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              ~{formatEta(fare.etaMinutes)} · {distanceKm.toFixed(1)} km · {seats} seat
              {seats === 1 ? "" : "s"}
              {stops > 0 ? ` · ${stops} stop${stops === 1 ? "" : "s"}` : ""}
            </p>
          </div>

          <div className="space-y-6 px-6 py-6">
            <SliderRow
              label="Distance"
              value={`${distanceKm.toFixed(1)} km`}
              min={1}
              max={60}
              step={0.5}
              valueNumber={distanceKm}
              onChange={setDistanceKm}
            />
            <SliderRow
              label="Intermediate stops"
              value={`${stops}`}
              min={0}
              max={4}
              step={1}
              valueNumber={stops}
              onChange={(v) => setStops(Math.round(v))}
            />
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Seats needed</p>
                <p className="text-xs text-muted">
                  {seats} passenger{seats === 1 ? "" : "s"}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => {
                  const active = seats === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSeats(n)}
                      className={`group relative overflow-hidden rounded-xl border py-3 text-sm font-bold transition-all ${
                        active
                          ? "border-rajlo-red bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                          : "border-line bg-surface text-foreground hover:border-rajlo-red/30 hover:bg-primary-soft/30"
                      }`}
                    >
                      <Icon
                        name={n === 1 ? "user" : "users"}
                        className={`mx-auto mb-0.5 h-4 w-4 ${active ? "text-white" : "text-muted group-hover:text-rajlo-red"}`}
                      />
                      <span>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCarpool((c) => !c)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                carpool
                  ? "border-rajlo-red bg-primary-soft shadow-md shadow-rajlo-red/15"
                  : "border-line bg-surface hover:border-rajlo-red/40"
              }`}
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl ${
                  carpool
                    ? "bg-rajlo-red text-white"
                    : "bg-primary-soft text-rajlo-red"
                }`}
              >
                <Icon name="users" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-extrabold tracking-tight">
                  Carpool · save 35%
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Match with a rider going the same way.
                </span>
              </span>
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  carpool ? "bg-rajlo-red" : "bg-line"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-all ${
                    carpool ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
          </>
          ) : (
          <RouteTaxiCalculator
            distanceKm={distanceKm}
            setDistanceKm={setDistanceKm}
            concession={concession}
            setConcession={setConcession}
          />
          )}
        </div>
      </FadeUp>

      {/* Live breakdown (private only — route taxi has the formula
         inline in its own panel above) */}
      {mode === "private" && (
      <FadeUp delay={0.1}>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
              <Icon name="file-text" className="h-3.5 w-3.5" />
            </span>
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Line-by-line
            </p>
          </div>
          <ul className="space-y-2.5">
            {fare.breakdown.map((row) => (
              <BreakdownRow
                key={row.label}
                label={row.label}
                amount={row.amountJMD}
              />
            ))}
            <BreakdownRow label="Subtotal" amount={fare.fareJMD} bold />
            {carpool && (
              <BreakdownRow
                label="Carpool match (−35%)"
                amount={carpoolFare - fare.fareJMD}
                accent="emerald"
              />
            )}
            <li className="flex items-center justify-between border-t border-line pt-3 text-sm font-extrabold">
              <span>Total</span>
              <span className="text-rajlo-red">{formatJMD(displayedFare)}</span>
            </li>
          </ul>
          <p className="mt-4 rounded-xl bg-surface-soft px-3 py-2 text-[11px] leading-relaxed text-muted">
            Final fare is locked when your driver accepts and auto-debits from
            your Rajlo wallet at the end of the trip. Top up anytime — Rajlo is
            cashless end-to-end.
          </p>
        </div>
      </FadeUp>
      )}

      {/* Components — private-only; route taxi has the formula in
         the calculator panel. */}
      {mode === "private" && (
      <FadeUp delay={0.14}>
        <Section title="What goes into a fare" icon="calculator">
          <RuleRow
            label="Base fare"
            value={formatJMD(FARE_CONFIG.baseFareJMD)}
            description="Flat starting price applied to every trip."
          />
          <RuleRow
            label="Distance"
            value={`${formatJMD(FARE_CONFIG.perKmJMD)} / km`}
            description="Multiplied by the road-following distance from pickup to dropoff."
          />
          <RuleRow
            label="Intermediate stops"
            value={`${formatJMD(FARE_CONFIG.perStopJMD)} / stop`}
            description="Each waypoint between pickup and dropoff adds a flat fee."
          />
          <RuleRow
            label="Extra seats"
            value={`${formatJMD(FARE_CONFIG.perExtraSeatJMD)} / seat`}
            description="First seat is included; additional passengers add a per-seat fee."
          />
          <RuleRow
            label="Minimum fare"
            value={formatJMD(FARE_CONFIG.minFareJMD)}
            description="Short trips are floored at this amount."
          />
        </Section>
      </FadeUp>
      )}

      {/* What's NOT charged */}
      <FadeUp delay={0.18}>
        <Section title="What we don't charge you for" icon="shield-check">
          <NoChargeRow
            label="Cancellation (before driver accepts)"
            description="If a driver hasn't accepted yet, cancelling is free."
          />
          <NoChargeRow
            label="Surge pricing"
            description="Rajlo fares are flat and predictable — no peak-time multipliers."
          />
          <NoChargeRow
            label="Service fee"
            description="The price you see is the price you pay. No hidden fees."
          />
        </Section>
      </FadeUp>

      <FadeUp delay={0.22}>
        <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
              <Icon name="plus-circle" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold tracking-tight">
                Ready when you are
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Book a ride at this estimated fare in two taps.
              </p>
            </div>
            <Link
              href="/rider/request"
              className="rounded-full bg-rajlo-red px-5 py-2 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Request ride
            </Link>
          </div>
        </div>
      </FadeUp>
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
          {title}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  valueNumber,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  valueNumber: number;
  onChange: (next: number) => void;
}) {
  const pct = ((valueNumber - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm font-bold text-rajlo-red">{value}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueNumber}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rajlo-red [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white"
        style={{
          background: `linear-gradient(to right, #f10100 0%, #f10100 ${pct}%, #e9e6dd ${pct}%, #e9e6dd 100%)`,
          borderRadius: "9999px",
        }}
      />
    </div>
  );
}

function BreakdownRow({
  label,
  amount,
  bold,
  accent,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  accent?: "emerald";
}) {
  return (
    <li className="flex items-center justify-between text-xs">
      <span className={bold ? "font-bold text-foreground" : "text-muted"}>
        {label}
      </span>
      <span
        className={`font-semibold ${
          accent === "emerald"
            ? "text-emerald-700"
            : bold
              ? "text-foreground"
              : "text-foreground"
        }`}
      >
        {amount < 0 ? "−" : ""}
        {formatJMD(Math.abs(amount))}
      </span>
    </li>
  );
}

function RuleRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-surface-soft p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <p className="shrink-0 text-sm font-extrabold tracking-tight text-rajlo-red">
        {value}
      </p>
    </div>
  );
}

function NoChargeRow({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Icon name="check-circle" className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </div>
  );
}

/* ════════════════════ Route Taxi calculator ════════════════════
 * TA-regulated estimator: base + (km × per-km), rounded to nearest
 * $10. Base + per-km read live from `getRouteTaxiTariff()` so a TA
 * fare increase automatically flows through. Single-leg, single-seat.
 * Concession toggle for the half-fare categories TA recognises
 * (children, students, seniors, disabled).
 */
function RouteTaxiCalculator({
  distanceKm,
  setDistanceKm,
  concession,
  setConcession,
}: {
  distanceKm: number;
  setDistanceKm: (v: number) => void;
  concession: boolean;
  setConcession: (v: boolean) => void;
}) {
  const tariff = getRouteTaxiTariff();
  const fullFare = calculateRouteFare(distanceKm);
  const concessionFare = calculateConcessionFare(distanceKm);
  const displayed = concession ? concessionFare : fullFare;
  const raw = tariff.baseRateJmd + distanceKm * tariff.perKmRateJmd;
  const rawLabel = formatJMD(Math.round(raw));

  return (
    <>
      <div className="bg-surface-soft px-6 py-5">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          Estimated fare · Route Taxi
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="text-4xl font-extrabold tracking-tight text-rajlo-red md:text-5xl">
            {formatJMD(displayed)}
          </p>
          {concession && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              Half-fare · save {formatJMD(fullFare - concessionFare)}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          {distanceKm.toFixed(1)} km · {tariff.label} · TA-regulated
        </p>
      </div>

      <div className="space-y-6 px-6 py-6">
        <SliderRow
          label="Distance"
          value={`${distanceKm.toFixed(1)} km`}
          min={1}
          max={60}
          step={0.5}
          valueNumber={distanceKm}
          onChange={setDistanceKm}
        />

        <button
          type="button"
          onClick={() => setConcession(!concession)}
          className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
            concession
              ? "border-emerald-400 bg-emerald-50 shadow-md shadow-emerald-200/50"
              : "border-line bg-surface hover:border-emerald-300"
          }`}
        >
          <span
            className={`grid h-10 w-10 place-items-center rounded-xl ${
              concession
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <Icon name="check-circle" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold tracking-tight">
              I qualify for half-fare
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Children, students in uniform, seniors, or physically disabled.
              TA-regulated.
            </span>
          </span>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              concession ? "bg-emerald-600" : "bg-line"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-all ${
                concession ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>

        <div className="rounded-xl bg-surface-soft px-4 py-3 text-[11px] text-muted">
          Formula: <span className="font-mono">JMD ${tariff.baseRateJmd} + (km × ${tariff.perKmRateJmd})</span>
          {" → "}
          <span className="font-mono">{rawLabel}</span>
          {" "}rounded to nearest $10 ={" "}
          <span className="font-bold text-foreground">{formatJMD(fullFare)}</span>.
          <br />
          <span className="text-[10px]">
            Tariff: {tariff.label} (effective {tariff.effectiveFrom}).
          </span>
        </div>
      </div>
    </>
  );
}
