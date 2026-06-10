import Image from "next/image";
import { LogoIcon } from "./logo";

/**
 * Decorative phone-frame mockup used in the landing page app
 * showcase. Renders a rounded phone shell with a screen that the
 * caller fills with any UI preview.
 *
 * Two ways to fill the screen:
 *   - `image`: a path under `/public` (e.g. `/mockups/rider-home.png`).
 *     Rendered with `object-cover` so a real device-frame screenshot
 *     drops in cleanly.
 *   - `children`: any React subtree. Used by the high-fidelity
 *     replicas below until real screenshots are available.
 *
 * If both are passed, `image` wins.
 */
export function PhoneMockup({
  children,
  image,
  imageAlt = "",
  rotate = 0,
  className = "",
}: {
  children?: React.ReactNode;
  image?: string;
  imageAlt?: string;
  rotate?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative mx-auto w-[260px] shrink-0 rounded-[40px] bg-rajlo-black p-3 shadow-2xl ring-1 ring-white/10 ${className}`}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <div className="absolute left-1/2 top-3 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-rajlo-black" />
      <div className="relative aspect-[9/19] overflow-hidden rounded-[28px] bg-white">
        {image ? (
          <Image
            src={image}
            alt={imageAlt}
            fill
            sizes="260px"
            className="object-cover"
            priority={false}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ────────────────  Re-usable inline glyphs ─────────────── */

const Glyph = {
  Search: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  ArrowRight: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  Pin: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
  Shield: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Wallet: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
      <path d="M2 9V6a2 2 0 0 1 2-2h12" />
      <circle cx="17" cy="13" r="1" fill="currentColor" />
    </svg>
  ),
  Check: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  ),
  Back: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M15 18 9 12l6-6" />
    </svg>
  ),
  TurnRight: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M5 19V14a4 4 0 0 1 4-4h10" />
      <path d="m14 5 5 5-5 5" />
    </svg>
  ),
  Phone: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.93.36 1.84.7 2.71a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.37-1.27a2 2 0 0 1 2.11-.45c.87.34 1.78.57 2.71.7a2 2 0 0 1 1.72 2z" />
    </svg>
  ),
  Chat: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
    </svg>
  ),
  CheckCircle: ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      className={`stroke-current ${className ?? ""}`}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  ),
};

/* ════════════════════════════════════════════════════════════
   Rider dashboard mock
   Pixel-faithful to /rider (src/app/rider/page.tsx) — the dark
   `rajlo-black` hero card with the red radial sweep, "Welcome
   back" eyebrow, "Where to today?" headline, white search pill,
   and trust-chip row. The slice below the hero shows the
   "Where you go most" quick-book card the real dashboard
   surfaces from history.
   ════════════════════════════════════════════════════════════ */
export function RiderRequestScreen() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface">
      {/* Top app bar — Logo + generic profile glyph — mirrors the
         (rider portal) shell. */}
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <LogoIcon height={14} className="text-rajlo-black" />
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-rajlo-red ring-2 ring-white">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 stroke-current fill-none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c1.5-3.5 5-5 7-5s5.5 1.5 7 5" />
          </svg>
        </span>
      </div>

      {/* Scrolling area */}
      <div className="flex-1 space-y-2.5 overflow-hidden px-3 pb-2">
        {/* ============ HERO CARD ============ */}
        <section className="relative overflow-hidden rounded-[18px] bg-rajlo-black p-3 text-white shadow-md shadow-rajlo-black/30">
          {/* Red radial gradients — same recipe as the real page */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.45) 0%, rgba(241,1,0,0) 50%), radial-gradient(circle at 0% 100%, rgba(241,1,0,0.20) 0%, rgba(241,1,0,0) 45%)",
            }}
          />
          {/* Ghost arc watermark in the corner */}
          <svg
            aria-hidden
            viewBox="0 0 200 200"
            className="absolute -right-12 -top-12 h-32 w-32 opacity-[0.05]"
          >
            <path
              d="M100 0 A100 100 0 0 1 200 100"
              stroke="white"
              strokeWidth="14"
              fill="none"
            />
          </svg>

          <div className="relative">
            <div className="flex items-center gap-1.5">
              <span className="font-secondary text-[7px] font-extrabold uppercase tracking-[0.18em] text-rajlo-red">
                Welcome back
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <h1 className="mt-1.5 text-[15px] font-extrabold leading-[1.05] tracking-tight">
              Where to
              <br />
              today?
            </h1>
            <p className="mt-1.5 max-w-[150px] text-[8px] leading-snug text-white/75">
              Door-to-door private rides or pay-by-leg route taxis.
            </p>

            {/* White search pill — exact pattern from /rider line 295 */}
            <div className="mt-2.5 flex items-center gap-1.5 rounded-[10px] bg-white p-[3px] pl-2 shadow-lg shadow-black/30">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-soft text-rajlo-red">
                <Glyph.Search className="h-2.5 w-2.5" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[6px] font-extrabold uppercase tracking-wider text-muted">
                  Where to?
                </span>
                <span className="block truncate text-[8px] font-bold text-rajlo-black">
                  Search a place or landmark
                </span>
              </span>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-rajlo-red text-white shadow-sm shadow-rajlo-red/40">
                <Glyph.ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>

            {/* Trust chips row */}
            <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-[6.5px] font-semibold text-white/80">
              <span className="inline-flex items-center gap-1">
                <span className="grid h-3 w-3 place-items-center rounded-full bg-white/10 text-white/85">
                  <Glyph.Shield className="h-2 w-2" />
                </span>
                TA-verified
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="grid h-3 w-3 place-items-center rounded-full bg-white/10 text-white/85">
                  <Glyph.Check className="h-2 w-2" />
                </span>
                Upfront fare
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="grid h-3 w-3 place-items-center rounded-full bg-white/10 text-white/85">
                  <Glyph.Wallet className="h-2 w-2" />
                </span>
                Wallet only
              </span>
            </div>
          </div>
        </section>

        {/* ============ EMPTY-STATE WELCOME ============
           Mirrors the real EmptyState a brand-new rider sees on
           the /rider dashboard before they've taken their first
           trip. No fake history, no fake fares — just the
           onboarding card the real app actually shows. */}
        <div className="relative overflow-hidden rounded-[14px] border border-line bg-white p-3 shadow-sm">
          <span
            aria-hidden
            className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary-soft"
          />
          <div className="relative">
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-rajlo-red text-white shadow-sm shadow-rajlo-red/30">
              <Glyph.Pin className="h-3.5 w-3.5" />
            </span>
            <p className="mt-2 text-[10px] font-extrabold leading-tight tracking-tight text-rajlo-black">
              Take your first ride
            </p>
            <p className="mt-1 text-[7px] leading-snug text-muted">
              Top up your wallet, pick a destination, and your trip history
              will start showing up here.
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-rajlo-red px-2 py-1 text-[7px] font-extrabold text-white shadow-sm shadow-rajlo-red/30">
              Book a ride
              <Glyph.ArrowRight className="h-2 w-2" />
            </span>
          </div>
        </div>

        {/* ============ MODE PICKER ============
           Static, evergreen — the two engines the product offers.
           No counts, no rates, no fake numbers. */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-[10px] border border-line bg-white p-2">
            <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-primary-soft text-rajlo-red">
              <Glyph.ArrowRight className="h-2.5 w-2.5" />
            </span>
            <p className="mt-1.5 text-[7.5px] font-extrabold text-rajlo-black">
              Private ride
            </p>
            <p className="text-[6px] leading-tight text-muted">
              Door-to-door, just you.
            </p>
          </div>
          <div className="rounded-[10px] border border-line bg-white p-2">
            <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-primary-soft text-rajlo-red">
              <Glyph.Pin className="h-2.5 w-2.5" />
            </span>
            <p className="mt-1.5 text-[7.5px] font-extrabold text-rajlo-black">
              Route taxi
            </p>
            <p className="text-[6px] leading-tight text-muted">
              TA-tariff, shared corridor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Driver active-trip mock
   Pixel-faithful to /driver/active-trip — top-left back button,
   dark-green NavBanner (#0E4D4A), full-screen map area with a
   nav puck, NavTripCard at the bottom with the same compact
   meta row + headline + emerald CTA layout the real card uses.
   ════════════════════════════════════════════════════════════ */
export function DriverMatchScreen() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#dbe2e8]">
      {/* Top-left circular back button — exact pattern from
         active-trip page header. */}
      <div className="absolute left-2 top-3 z-20">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-rajlo-black shadow-md ring-1 ring-black/5">
          <Glyph.Back className="h-3 w-3" />
        </span>
      </div>

      {/* NavBanner — dark green, two rows, exact pattern from
         components/nav/nav-banner.tsx. */}
      <div className="relative z-10 px-2 pt-12">
        <div className="rounded-[10px] bg-[#0E4D4A] text-white shadow-xl ring-1 ring-black/20">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/10">
              <Glyph.TurnRight className="h-3.5 w-3.5 text-white" />
            </span>
            <p className="flex-1 truncate text-[10px] font-bold leading-tight">
              Turn right onto Hope Rd
            </p>
            <span className="shrink-0 font-secondary text-[10px] font-extrabold tabular-nums">
              300 m
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-t border-white/15 px-2.5 py-1">
            <span className="text-[6px] font-bold uppercase tracking-wider text-white/60">
              Then
            </span>
            <Glyph.TurnRight className="h-2 w-2 text-white/85" />
            <p className="flex-1 truncate text-[7px] font-semibold text-white/90">
              Continue onto Old Hope Rd
            </p>
          </div>
        </div>
      </div>

      {/* Map area — fills behind the banner / above the bottom
         card. Tinted base + faux roads + the brand-red route
         polyline + nav-arrow puck. */}
      <div className="absolute inset-0">
        {/* Map base — soft slate gray like Google Maps default */}
        <div className="absolute inset-0 bg-[#dbe2e8]" />
        {/* Subtle map grid texture */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Wider "main roads" */}
        <div className="absolute inset-y-0 left-[28%] w-3 bg-white/85" />
        <div className="absolute inset-y-0 left-[28%] w-3 mix-blend-overlay bg-white/30" />
        <div className="absolute inset-x-0 top-[58%] h-3 bg-white/85" />

        {/* Brand-red route polyline */}
        <svg
          viewBox="0 0 100 200"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="rt-mockup" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#f10100" />
              <stop offset="100%" stopColor="#7a0000" />
            </linearGradient>
          </defs>
          {/* casing */}
          <path
            d="M 28 200 L 28 120 Q 28 96 42 92 L 70 84 Q 82 80 82 64 L 82 10"
            fill="none"
            stroke="#3a0000"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* main */}
          <path
            d="M 28 200 L 28 120 Q 28 96 42 92 L 70 84 Q 82 80 82 64 L 82 10"
            fill="none"
            stroke="url(#rt-mockup)"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Destination pin at end of route */}
        <div className="absolute left-[78%] top-[6%]">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-rajlo-red text-white shadow-md ring-2 ring-white">
            <Glyph.Pin className="h-2.5 w-2.5" />
          </span>
        </div>

        {/* Nav puck — same red-circle + white-arrow shape as the
           real map-view.tsx navArrowIconSvg. */}
        <div className="absolute left-[28%] top-[60%] -translate-x-1/2 -translate-y-1/2">
          <div className="relative h-9 w-9">
            <div className="absolute inset-0 animate-pulse rounded-full bg-rajlo-red/35 blur-sm" />
            <div className="absolute inset-0 grid place-items-center rounded-full bg-rajlo-red ring-[2px] ring-white shadow-lg">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
                <path d="M12 3 L19 16 L12 12.5 L5 16 Z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Floating live chip top-right */}
        <div className="absolute right-2 top-[58px] inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-[3px] text-[6px] font-extrabold uppercase tracking-wider text-rajlo-black shadow ring-1 ring-black/5">
          <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" />
          Live nav
        </div>

        {/* Floating controls strip on the right (mute / re-center) */}
        <div className="absolute right-2 top-[78px] flex flex-col gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-rajlo-black shadow-md ring-1 ring-black/5">
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 stroke-current"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
            </svg>
          </span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-rajlo-red shadow-md ring-1 ring-black/5">
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 stroke-current fill-none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </span>
        </div>
      </div>

      {/* NavTripCard — bottom sheet, exact layout from
         components/nav/nav-trip-card.tsx. Eyebrows + the action
         pill are real, the trip meta itself is left generic (no
         fabricated rider name, fare, or address). */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-2 pb-2">
        <div className="rounded-[12px] bg-white shadow-2xl ring-1 ring-line">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-secondary text-[6px] font-extrabold uppercase tracking-wider text-muted">
                Trip in progress
              </p>
              <p className="mt-0.5 truncate text-[9px] font-bold text-foreground">
                Heading to drop-off
              </p>
              <p className="truncate text-[7px] text-muted">
                Turn-by-turn navigation
              </p>
            </div>
            <button className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1.5 text-[8px] font-bold text-white shadow-md shadow-emerald-600/30">
              Complete
              <Glyph.CheckCircle className="h-2.5 w-2.5" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-1 border-t border-line py-1 text-[6px] font-bold uppercase tracking-wider text-muted">
            More options
            <svg
              viewBox="0 0 24 24"
              className="h-2 w-2 stroke-current"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Compliance screen — small auxiliary mock used elsewhere.
   ════════════════════════════════════════════════════════════ */
export function ComplianceScreen() {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <LogoIcon height={14} className="text-rajlo-black" />
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[7px] font-extrabold text-emerald-700">
          ALL CLEAR
        </span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-hidden p-2.5">
        <div>
          <p className="font-secondary text-[7px] font-extrabold uppercase tracking-wider text-rajlo-red">
            Compliance
          </p>
          <h3 className="text-[12px] font-extrabold tracking-tight text-rajlo-black">
            Documents
          </h3>
        </div>
        {[
          ["TA Franchise", "Apr 2027", "good"],
          ["TA Driver Badge", "Mar 2027", "good"],
          ["Cert. of Fitness", "Feb 2027", "good"],
          ["Insurance (PPV)", "Aug 2026", "warn"],
          ["Driver's Licence", "2031", "good"],
        ].map(([label, expiry, state]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-[8px] border border-line bg-white px-2 py-1.5"
          >
            <div className="leading-tight">
              <p className="text-[8px] font-bold text-rajlo-black">{label}</p>
              <p className="text-[6.5px] text-muted">{expiry}</p>
            </div>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[6px] font-extrabold ${
                state === "warn"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {state === "warn" ? "RENEW" : "VALID"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
