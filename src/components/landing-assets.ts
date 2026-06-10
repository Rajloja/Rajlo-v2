/**
 * Shared landing-page constants.
 *
 * Pulled into its own module so both the server-component landing
 * shell and the client-only Hero island can import the same data
 * without dragging either across the "use client" boundary.
 *
 * Photo strategy: every URL is a local file under `/public/landing/`.
 * Drop replacements at the same paths with the same filenames to swap
 * the imagery without touching React code. The brand-tinted gradient
 * below sits under every photo div so any missing file shows brand
 * colour instead of a blank rectangle.
 */
export const PHOTOS = {
  hero: [
    "/landing/hero-1.jpg",
    "/landing/hero-2.jpg",
    "/landing/hero-3.jpg",
    "/landing/hero-4.jpg",
  ],
  modePrivate: "/landing/mode-private.jpg",
  modeRouteTaxi: "/landing/mode-route-taxi.jpg",
  modeDrive: "/landing/mode-drive.jpg",
  pillarSafety: "/landing/pillar-safety.jpg",
  pillarCashless: "/landing/pillar-cashless.jpg",
  pillarLocal: "/landing/pillar-local.jpg",
  pillarFair: "/landing/pillar-fair.jpg",
  driverHero: "/landing/driver-hero.jpg",
};

/** Brand-tinted gradient that sits behind every photo div. A missing
 *  file shows brand colour, not a blank box. */
export const BRAND_FALLBACK_BG =
  "linear-gradient(155deg, #1a1d10 0%, rgba(241,1,0,0.35) 55%, #07090a 100%)";
