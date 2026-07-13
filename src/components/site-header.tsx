"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";

type NavLink = { label: string; href: string };
type NavItem = NavLink | { label: string; menu: NavLink[] };

/** Burger-menu items. The primary nav simplified in the July 2026
 *  redesign — every deep link moved into the burger, leaving only a
 *  single central "audience swap" link ("Drive with us" on the rider
 *  variant, "Ride with us" on the driver variant) beside the logo.
 *
 *  Support is intentionally a FLAT link (not a submenu) so a tap
 *  goes straight to /support — which is the routing hub that fans
 *  out to Rider support, Driver help & safety, Help Center, Contact,
 *  and the fare estimator. Prior to July 2026 the drawer had a
 *  Support submenu that expanded in place; that hid the hub itself
 *  behind a two-tap gesture even though the hub is exactly what
 *  most visitors are hunting for. */
const BURGER_ITEMS: NavItem[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Fare estimator", href: "/fare-estimator" },
  { label: "Support", href: "/support" },
  {
    label: "Legal",
    menu: [
      { label: "Terms of Service", href: "/legal/terms-of-service" },
      { label: "Privacy Policy", href: "/legal/privacy-policy" },
      { label: "All policies", href: "/legal" },
    ],
  },
];

const isMenu = (i: NavItem): i is { label: string; menu: NavLink[] } =>
  "menu" in i;

/**
 * Shared sticky header for all public pages.
 *
 * Two visual modes:
 *   - `default` — opaque light bar. Every page EXCEPT the landing.
 *   - `transparentOverDark` — frosted-glass strip over the dark
 *     landing hero with white text + white-variant logo. Morphs to
 *     the solid light bar the moment the user scrolls past ~64px.
 *     Stays `fixed` in both states so it never disappears mid-
 *     transition (the previous `fixed → sticky` swap broke because
 *     `sticky` can't show after the user scrolls past its anchor).
 *
 * Mobile UX:
 *   - The "Book a ride / Open dashboard" CTA is hidden behind a
 *     2-line hamburger button. Tapping it slides a sleek drawer
 *     down from the top with the full nav + Sign-in + the CTA.
 *   - Desktop keeps the inline links + CTA exactly as before.
 */
export function SiteHeader({
  bookHref = "/auth/rider/signup",
  bookLabel = "Book a ride",
  transparentOverDark = false,
  variant = "rider",
}: {
  bookHref?: string;
  bookLabel?: string;
  transparentOverDark?: boolean;
  /** Header variant — drives the audience-swap link ("Drive with us"
   *  on the rider variant, "Ride with us" on the driver variant) and
   *  the right-side action shape (rider shows "Sign in" + CTA button;
   *  driver shows only the "Sign in" CTA — no separate text link). */
  variant?: "rider" | "driver";
} = {}) {
  const audienceLink =
    variant === "driver"
      ? { label: "Ride with us", href: "/" }
      : { label: "Drive with us", href: "/drive" };
  const signInHref =
    variant === "driver" ? "/auth/driver/login" : "/auth/rider/login";
  const pathname = usePathname();

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!transparentOverDark) return;
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparentOverDark]);

  // Mobile drawer open state. Closes on any link tap + on Escape.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while open so the page underneath doesn't
    // jitter when the user pulls down to read the drawer.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Close the drawer the moment the user changes routes (link tap).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const isGlass = transparentOverDark && !scrolled;

  const headerClass = transparentOverDark
    ? isGlass
      ? "fixed top-0 inset-x-0 z-40 border-b border-white/10 bg-rajlo-black/30 backdrop-blur-xl supports-backdrop-filter:bg-rajlo-black/20 transition-colors duration-300"
      : "fixed top-0 inset-x-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md supports-backdrop-filter:bg-surface/80 shadow-sm transition-colors duration-300"
    : "sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md supports-backdrop-filter:bg-surface/80";

  const linkTone = isGlass
    ? "text-white/85 hover:text-white"
    : "text-muted hover:text-foreground";
  const activeLinkTone = isGlass ? "text-white" : "text-foreground";
  const signInTone = isGlass
    ? "text-white/85 hover:text-white"
    : "text-muted hover:text-foreground";
  // Hamburger icon tone — flips for legibility against the
  // brand-dark glass or the white solid bar.
  const hamburgerStroke = isGlass ? "stroke-white" : "stroke-rajlo-black";

  return (
    <>
      <header className={headerClass}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 md:gap-4">
          <Logo
            size="sm"
            tagline
            variant={isGlass ? "white" : "default"}
          />

          {/* Right side — desktop: audience-swap link + sign-in
             (outlined pill) + primary CTA + burger. Mobile: only the
             burger; every other action moves into the drawer.
             Layout logic:
               - Audience-swap link (Drive with us / Ride with us)
                 sits FIRST in the right group so the header reads
                 logo — spacer — audience — sign-in — CTA — burger.
                 That's more balanced than a central nav with three
                 tightly-packed buttons on the far right, and it
                 groups the audience swap with the auth actions
                 (which is where a visitor mentally is when they're
                 hunting for it).
               - Sign in is now an OUTLINED pill (border + subtle
                 fill on hover) so it reads as a button rather than
                 a plain text link, but is visually distinct from
                 the solid-red "Book a ride" primary CTA.
               - Driver variant: no separate "Sign in" outlined
                 button — the primary red CTA already says "Sign in"
                 because there's no "Book a ride" concept on that
                 audience. Rendering both would be duplicative. */}
          <div className="flex items-center gap-2 md:gap-3">
            <Link
              href={audienceLink.href}
              className={`hidden text-sm font-semibold md:inline-flex md:px-2 ${
                pathname === audienceLink.href ? activeLinkTone : linkTone
              }`}
            >
              {audienceLink.label}
            </Link>
            {variant === "rider" && (
              <Link
                href={signInHref}
                className={`hidden rounded-full border px-4 py-2 text-sm font-semibold transition-colors md:inline-flex ${
                  isGlass
                    ? "border-white/25 bg-white/5 text-white/90 hover:bg-white/15"
                    : "border-line bg-surface text-foreground hover:bg-surface-soft"
                }`}
              >
                Sign in
              </Link>
            )}
            <Link
              href={variant === "driver" ? signInHref : bookHref}
              className="hidden rounded-full bg-rajlo-red px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover md:inline-flex"
            >
              {variant === "driver" ? "Sign in" : bookLabel}
            </Link>

            {/* Burger — visible on ALL breakpoints in the July 2026
               redesign. On mobile it opens the drawer (as before);
               on desktop it opens the same drawer, giving one place
               to reach How it works / Fare estimator / Support /
               Legal regardless of screen size. */}
            <button
              type="button"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((v) => !v)}
              className={`grid h-10 w-10 place-items-center rounded-xl transition-colors ${
                isGlass
                  ? "bg-white/10 hover:bg-white/20"
                  : "bg-surface-soft hover:bg-primary-soft"
              }`}
            >
              {/* Two-line minimal hamburger — collapses to an X
                 (rotated lines) when the drawer is open. */}
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 ${hamburgerStroke}`}
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
                aria-hidden
              >
                <path
                  d={drawerOpen ? "M5 6 L19 18" : "M5 9h14"}
                  className="transition-all"
                />
                <path
                  d={drawerOpen ? "M5 18 L19 6" : "M5 15h14"}
                  className="transition-all"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ─────────── Mobile drawer ─────────── */}
      {/* Backdrop — appears the moment the drawer opens so taps
         outside the drawer dismiss it. Lives outside the header
         so it can cover the full viewport. */}
      <div
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-50 bg-rajlo-black/55 backdrop-blur-sm transition-opacity duration-300 ${
          drawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer panel — slides DOWN from the top with the brand
         dark-gradient surface. Mirrors the dark-hero aesthetic so
         the transition from header to drawer feels seamless. */}
      <aside
        className={`fixed inset-x-0 top-0 z-50 overflow-hidden border-b border-white/10 text-white shadow-2xl transition-transform duration-300 ease-out ${
          drawerOpen ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{
          background:
            "radial-gradient(circle at 100% 0%, rgba(241,1,0,0.32) 0%, rgba(241,1,0,0) 45%), linear-gradient(170deg, #1a1d10 0%, #111906 60%, #07090a 100%)",
        }}
        aria-label="Mobile navigation"
      >
        <div className="mx-auto max-w-6xl px-4 pb-6 pt-3.5">
          {/* Top row — keep the same logo + close button so the
             drawer feels like an extension of the header. */}
          <div className="flex items-center justify-between">
            <Logo size="sm" variant="white" tagline />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 stroke-white"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
                aria-hidden
              >
                <path d="M6 6l12 12M6 18 18 6" />
              </svg>
            </button>
          </div>

          {/* Nav links — bigger touch targets than the desktop
             inline links since the user is in a focused menu.
             Items with a `menu` render as an expandable group. */}
          <nav className="mt-5 grid gap-1" aria-label="Mobile primary">
            {/* Audience-swap link — mobile only. On desktop the same
               link sits centrally in the top nav bar (rendered from
               the desktop <nav> above), so surfacing it here again
               would be duplicated. The `md:hidden` wrap keeps it in
               the drawer only for phone-width where the desktop nav
               is hidden and this drawer is the only place to reach it. */}
            <Link
              href={audienceLink.href}
              className={`flex items-center justify-between rounded-2xl px-4 py-3 text-base font-extrabold tracking-tight transition-colors md:hidden ${
                pathname === audienceLink.href
                  ? "bg-white text-rajlo-red"
                  : "text-white/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              {audienceLink.label}
              <svg viewBox="0 0 24 24" className="h-4 w-4 stroke-current" strokeWidth={2} strokeLinecap="round" fill="none">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
            {BURGER_ITEMS.map((item) =>
              isMenu(item) ? (
                <MobileGroup
                  key={item.label}
                  label={item.label}
                  items={item.menu}
                  pathname={pathname}
                />
              ) : (
                (() => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-base font-extrabold tracking-tight transition-colors ${
                        active
                          ? "bg-white text-rajlo-red"
                          : "text-white/90 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.label}
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 stroke-current"
                        strokeWidth={2}
                        strokeLinecap="round"
                        fill="none"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </Link>
                  );
                })()
              ),
            )}
          </nav>

          {/* Divider + sign-in + CTA — the CTA gets the standout
             brand-red treatment so it remains the obvious action.
             On the driver variant we collapse to a single "Sign in"
             CTA (no separate outline button) — matches the desktop
             right-side treatment. */}
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-5">
            {variant === "rider" && (
              <Link
                href={signInHref}
                className="flex-1 rounded-full border border-white/20 px-4 py-3 text-center text-sm font-bold text-white/90 transition-colors hover:bg-white/10"
              >
                Sign in
              </Link>
            )}
            <Link
              href={variant === "driver" ? signInHref : bookHref}
              className="flex-1 rounded-full bg-rajlo-red px-4 py-3 text-center text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              {variant === "driver" ? "Sign in" : bookLabel}
            </Link>
          </div>

          <p className="mt-5 text-center font-secondary text-[10px] font-extrabold uppercase tracking-[0.4em] text-white/40">
            Rajlo · Let&apos;s go!
          </p>
        </div>
      </aside>
    </>
  );
}

/* ─────────────── Desktop dropdown menu ──────────────────
 * Hover-open with a small close delay so the cursor can travel
 * the gap between trigger and panel without the menu snapping
 * shut. Click still works as a fallback for keyboard users and
 * touch-on-trackpad sessions (closes on outside-click + Escape). */
function DesktopMenu({
  label,
  items,
  active,
  linkTone,
  activeLinkTone,
  isGlass,
}: {
  label: string;
  items: NavLink[];
  active: boolean;
  linkTone: string;
  activeLinkTone: string;
  isGlass: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending close (cursor came back into the menu area).
  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        className={`inline-flex items-center gap-1 text-sm font-medium ${
          active ? `font-semibold ${activeLinkTone}` : linkTone
        }`}
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 stroke-current transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown panel — light card on solid header, frosted-dark
         card on the glass landing header. The wrapping pt-2 keeps
         a continuous hover zone over the trigger→panel gap so the
         menu doesn't snap shut while the cursor travels down. */}
      <div
        role="menu"
        aria-label={label}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        className={`absolute right-0 top-full z-50 min-w-[220px] origin-top overflow-hidden rounded-2xl border pt-0 shadow-2xl transition-all duration-150 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        } ${
          isGlass
            ? "mt-2 border-white/15 bg-rajlo-black/80 backdrop-blur-xl"
            : "mt-2 border-line bg-surface"
        }`}
      >
        <ul className="p-1.5">
          {items.map((m) => (
            <li key={m.href}>
              <Link
                role="menuitem"
                href={m.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isGlass
                    ? "text-white/85 hover:bg-white/10 hover:text-white"
                    : "text-muted hover:bg-primary-soft hover:text-rajlo-red"
                }`}
              >
                {m.label}
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3 stroke-current opacity-60"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fill="none"
                  aria-hidden
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─────────────── Mobile drawer accordion group ──────────────────
 * Same data shape as DesktopMenu, but expands inline in the slide-
 * down drawer rather than popping out. Open state defaults to
 * expanded when one of its children matches the current pathname
 * so the active page is always visible. */
function MobileGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavLink[];
  pathname: string | null;
}) {
  const containsActive = items.some((m) => m.href === pathname);
  const [open, setOpen] = useState(containsActive);

  return (
    <div className="overflow-hidden rounded-2xl bg-white/[0.04]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-base font-extrabold tracking-tight text-white/90 transition-colors hover:bg-white/10 hover:text-white"
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 stroke-current transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="grid gap-0.5 px-2 pb-2 pt-1">
            {items.map((m) => {
              const active = m.href === pathname;
              return (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                      active
                        ? "bg-white text-rajlo-red"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {m.label}
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3 stroke-current opacity-60"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      fill="none"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
