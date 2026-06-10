"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./logo";

type NavLink = { label: string; href: string };
type NavItem = NavLink | { label: string; menu: NavLink[] };

/** Single source of truth for the top-bar nav. Items with a `menu`
 * key render as a dropdown (desktop) or expandable accordion
 * (mobile drawer). Plain `href` items render as a single link. */
const NAV_ITEMS: NavItem[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Fare estimator", href: "/fare-estimator" },
  { label: "Drive with us", href: "/driver-join" },
  {
    label: "Support",
    menu: [
      { label: "Help & FAQs", href: "/help" },
      { label: "Safety policy", href: "/legal/safety-disclaimer-emergency-policy" },
      { label: "Contact", href: "/contact" },
    ],
  },
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
}: {
  bookHref?: string;
  bookLabel?: string;
  transparentOverDark?: boolean;
} = {}) {
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

          {/* Desktop nav — hidden on mobile. */}
          <nav
            className="hidden items-center gap-6 md:flex"
            aria-label="Primary"
          >
            {NAV_ITEMS.map((item) => {
              if (isMenu(item)) {
                const anyActive = item.menu.some((m) => pathname === m.href);
                return (
                  <DesktopMenu
                    key={item.label}
                    label={item.label}
                    items={item.menu}
                    active={anyActive}
                    linkTone={linkTone}
                    activeLinkTone={activeLinkTone}
                    isGlass={isGlass}
                  />
                );
              }
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`text-sm font-medium ${
                    active ? `font-semibold ${activeLinkTone}` : linkTone
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side — desktop: sign-in + CTA. Mobile: hamburger
             only. The CTA moves into the drawer on mobile. */}
          <div className="flex items-center gap-2">
            <Link
              href="/auth/rider/login"
              className={`hidden rounded-full px-3 py-2 text-sm font-medium md:inline-flex ${signInTone}`}
            >
              Sign in
            </Link>
            <Link
              href={bookHref}
              className="hidden rounded-full bg-rajlo-red px-4 py-2 text-sm font-semibold text-white shadow-md shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover md:inline-flex"
            >
              {bookLabel}
            </Link>

            {/* Mobile hamburger — 2-line minimal pictogram. */}
            <button
              type="button"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((v) => !v)}
              className={`grid h-10 w-10 place-items-center rounded-xl transition-colors md:hidden ${
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
        className={`fixed inset-0 z-50 bg-rajlo-black/55 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          drawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer panel — slides DOWN from the top with the brand
         dark-gradient surface. Mirrors the dark-hero aesthetic so
         the transition from header to drawer feels seamless. */}
      <aside
        className={`fixed inset-x-0 top-0 z-50 overflow-hidden border-b border-white/10 text-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${
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
            {NAV_ITEMS.map((item) =>
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
             brand-red treatment so it remains the obvious action. */}
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-5">
            <Link
              href="/auth/rider/login"
              className="flex-1 rounded-full border border-white/20 px-4 py-3 text-center text-sm font-bold text-white/90 transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              href={bookHref}
              className="flex-1 rounded-full bg-rajlo-red px-4 py-3 text-center text-sm font-extrabold text-white shadow-lg shadow-rajlo-red/40 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              {bookLabel}
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
 * Click-to-open menu (closes on outside-click, Escape, or
 * navigation). Click-open beats pure hover for accessibility +
 * touch on a laptop trackpad — hover misfires when the cursor
 * drifts onto the panel through the gap. */
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
         card on the glass landing header. Either way it pops up
         just below the trigger with a small offset. */}
      <div
        role="menu"
        aria-label={label}
        className={`absolute right-0 top-full z-50 mt-2 min-w-[220px] origin-top overflow-hidden rounded-2xl border shadow-2xl transition-all duration-150 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        } ${
          isGlass
            ? "border-white/15 bg-rajlo-black/80 backdrop-blur-xl"
            : "border-line bg-surface"
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
