"use client";

import { Icon } from "./icons";

/**
 * Shared "your driver + their vehicle" card. Used on:
 *   - Rider live-trip page
 *   - Rider history detail page
 *   - Public trip-share page
 *
 * Renders consistently across all three so a rider sees the same
 * face / plate / colour everywhere they look. Optional `phone` adds a
 * tap-to-call action for the rider's own pages — not shown on the
 * public share-link view.
 *
 * Vehicle colour is rendered as a tinted swatch alongside the colour
 * name — the goal is "spot the silver Probox" at a glance, not just
 * read words.
 */
export function DriverVehicleCard({
  name,
  avatarUrl,
  rating,
  ratingCount,
  plateNumber,
  vehicleMake,
  vehicleModel,
  vehicleYear,
  vehicleColor,
  phone,
  extraAction,
}: {
  name: string;
  avatarUrl: string | null;
  /** Average rating, 1dp. Null = no ratings yet. */
  rating?: number | null;
  ratingCount?: number;
  plateNumber: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;
  /** When provided, renders a tap-to-call button next to the name. */
  phone?: string | null;
  /** Optional secondary action rendered next to the call button —
   *  used by the rider live-trip page to surface the chat icon
   *  alongside the call icon so both fit at the same eye level. */
  extraAction?: React.ReactNode;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "?";
  const yearMakeModel = [
    vehicleYear ? String(vehicleYear) : null,
    vehicleMake,
    vehicleModel,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="overflow-hidden rounded-2xl border border-rajlo-red/30 bg-primary-soft">
      <div className="flex items-start gap-4 p-5">
        {/* Avatar */}
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-base font-extrabold text-rajlo-red ring-2 ring-rajlo-red/20">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Your driver
          </p>
          <p className="mt-0.5 truncate text-base font-extrabold tracking-tight">
            {name}
          </p>
          {/* Rating row — always renders so the rider knows what to
             look for. When the driver has at least one rating, show
             stars + value. Otherwise surface "TA-verified" so the
             space isn't blank and a brand-new driver doesn't look
             unrated/untrusted. */}
          <div className="mt-1.5 flex items-center gap-2">
            {rating != null ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-rajlo-red px-2 py-0.5 text-xs font-extrabold text-white shadow-sm shadow-rajlo-red/30">
                  <Icon name="star" className="h-3 w-3" />
                  {rating.toFixed(1)}
                </span>
                {typeof ratingCount === "number" && ratingCount > 0 && (
                  <span className="text-[11px] font-semibold text-muted">
                    {ratingCount} trip{ratingCount === 1 ? "" : "s"} rated
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rajlo-red/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-rajlo-red">
                <Icon name="shield-check" className="h-3 w-3" />
                TA-verified
              </span>
            )}
          </div>
        </div>

        {/* Action group — in-app call + chat launcher come in via
           `extraAction` from the parent. The legacy `tel:` PSTN link
           was removed: rider/driver privacy means phone numbers are
           never exposed in the UI, and the in-app voice flow
           (LiveKit) handles all rider↔driver voice contact. */}
        {extraAction && (
          <div className="flex shrink-0 items-center gap-2">{extraAction}</div>
        )}
      </div>

      {/* Vehicle strip — colour swatch + plate sit on a contrasting
         band so they read at a glance even in motion. */}
      <div className="flex items-center gap-3 border-t border-rajlo-red/15 bg-white px-5 py-3">
        <ColourSwatch colorName={vehicleColor} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold tracking-tight">
            {[vehicleColor, yearMakeModel].filter(Boolean).join(" · ") ||
              "Vehicle details unavailable"}
          </p>
          {plateNumber && (
            <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">
              <span className="inline-block rounded-sm bg-rajlo-red px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-white">
                RED PLATE
              </span>
              <span className="ml-2 align-middle font-mono">{plateNumber}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Best-effort hex lookup for the vehicle colour name. Falls back to
 * a neutral grey for anything we don't recognise — not the end of
 * the world, the colour name itself is still rendered next to it.
 */
const COLOUR_HEX: Record<string, string> = {
  white: "#ffffff",
  silver: "#c8c9cc",
  grey: "#6b7077",
  gray: "#6b7077",
  black: "#1a1a1a",
  red: "#f10100",
  maroon: "#800000",
  blue: "#1d4ed8",
  navy: "#1e3a8a",
  green: "#15803d",
  yellow: "#facc15",
  gold: "#d4af37",
  beige: "#d6c8a8",
  brown: "#7c4f1d",
  orange: "#f97316",
  purple: "#7c3aed",
};

function ColourSwatch({ colorName }: { colorName: string | null }) {
  const key = (colorName ?? "").toLowerCase();
  const hex = COLOUR_HEX[key] ?? "#cbcaca";
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line shadow-inner"
      style={{ backgroundColor: hex }}
      aria-label={colorName ? `${colorName} car` : "vehicle colour"}
      title={colorName ?? undefined}
    >
      <Icon
        name="car"
        className={`h-4 w-4 ${
          // White / yellow / silver swatches need a dark icon to be
          // visible; everything else uses white for contrast.
          ["white", "silver", "yellow", "beige", "gold"].includes(key)
            ? "text-foreground"
            : "text-white"
        }`}
      />
    </span>
  );
}
