"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNativeApp, openExternalUrl } from "@/lib/native";

/**
 * Capacitor-only navigation behaviour for the driver app.
 *
 * The driver native app is a thin WebView around driver.rajlo.com.
 * This component does two things, and is a no-op on the web:
 *
 *  1. Link interception — any LINK the driver taps that points
 *     outside the driver portal (marketing, legal, the rider/admin
 *     surfaces, or any non-Rajlo site) opens in the device's real
 *     browser instead of hijacking the driver shell.
 *
 *  2. Snap-back — a safety net for navigation that ISN'T a link
 *     click (a notification deep-link, a programmatic router.push):
 *     if the app still lands somewhere off-portal, bounce to /driver.
 */

// Paths that legitimately stay INSIDE the driver app — the driver
// portal itself, the auth flows a driver needs to sign in / recover,
// and the in-app error pages. Everything else opens externally.
const IN_APP_PREFIXES = [
  "/driver",
  "/auth/driver",
  "/auth/callback",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/confirm",
  "/403",
  "/404",
];

function isInAppPath(path: string): boolean {
  if (path === "/driver") return true;
  return IN_APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** A Rajlo host — rajlo.com or any *.rajlo.com subdomain. */
function isRajloHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "rajlo.com" || h.endsWith(".rajlo.com");
}

export function NativeDriverGuard() {
  const pathname = usePathname();
  const router = useRouter();

  // Mark <html data-rajlo-native="1"> so globals.css can apply
  // native-only styling. Set once on mount inside the Capacitor shell.
  useEffect(() => {
    if (!isNativeApp()) return;
    if (typeof document === "undefined") return;
    document.documentElement.dataset.rajloNative = "1";
    return () => {
      delete document.documentElement.dataset.rajloNative;
    };
  }, []);

  // ─── 1. Link interception — off-portal links → system browser ───
  useEffect(() => {
    if (!isNativeApp()) return;
    if (typeof document === "undefined") return;

    const onClick = (e: MouseEvent) => {
      // Only plain primary clicks/taps — leave modified clicks alone.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // Non-web schemes (mailto:, tel:) — let the OS handle them.
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      // Stays in the app ONLY when it's a Rajlo URL on a driver-portal
      // or auth path. Off-portal Rajlo pages and any other site open
      // in the device browser.
      if (isRajloHost(url.hostname) && isInAppPath(url.pathname)) return;

      // Capture-phase + stopPropagation so Next's <Link> handler never
      // also fires — the external open fully replaces the navigation.
      e.preventDefault();
      e.stopPropagation();
      void openExternalUrl(url.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // ─── 2. Snap-back safety net (non-link navigation) ───
  useEffect(() => {
    if (!isNativeApp()) return;
    if (!pathname) return;
    // `/legal` may render in-app if reached without a link click
    // (harmless), so the snap-back allows a touch more than the link
    // interceptor does.
    if (isInAppPath(pathname) || pathname.startsWith("/legal")) return;
    router.replace("/driver");
  }, [pathname, router]);

  return null;
}
