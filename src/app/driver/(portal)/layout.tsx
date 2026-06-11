import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { PortalLayout } from "@/components/portal-layout";
import { SessionGuard } from "@/components/session-guard";
import { DriverActivityTracker } from "@/components/driver-activity-tracker";
import { DriverPortalGate } from "@/components/driver-portal-gate";
import { DriverOnlinePresence } from "@/components/driver-online-presence";
import { DriverWarmupGate } from "@/components/driver-warmup-gate";
import { ConnectivityMonitor } from "@/components/connectivity-monitor";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { LegalConsentGate } from "@/components/legal-consent-gate";
import { DeviceFingerprintBeacon } from "@/components/device-fingerprint-beacon";
import { IncomingCallProvider } from "@/components/incoming-call-provider";
import { ActiveCallProvider } from "@/components/active-call-provider";
import { ActiveTripPositionProvider } from "@/components/active-trip-position-provider";
import { driverNav } from "@/lib/mock-data";
import { getDriverStatus } from "@/lib/driver-status";

/**
 * Override the root viewport for the driver portal: lock pinch- and
 * double-tap-zoom off so the WebView behaves like a real native app
 * instead of a browser page. Maximum-scale=1 + userScalable=false is
 * the canonical recipe; we don't apply this globally because the
 * rider portal + marketing site need accessibility zoom for low-
 * vision riders. The driver UI is an operational tool with fixed
 * sizing, so locking zoom there is the right trade-off.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f10100",
  interactiveWidget: "resizes-content",
};

/**
 * Gates the activated driver portal. Routes the signed-in driver to:
 *   - /auth/driver/login    if they're not signed in (proxy also does this)
 *   - /driver/onboarding    if they haven't submitted onboarding yet
 *   - /driver/pending       if they've submitted but admin hasn't activated
 * Otherwise renders the portal with sidebar.
 */
export default async function DriverPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = await getDriverStatus();

  if (status.state === "unauthenticated") redirect("/auth/driver/login");
  if (status.state === "not_a_driver") redirect("/");
  if (status.state === "needs_onboarding") redirect("/driver/onboarding");
  if (
    status.state === "pending_verification" ||
    status.state === "rejected" ||
    status.state === "deactivated"
  ) {
    redirect("/driver/pending");
  }

  return (
    <PortalLayout
      title="Driver Portal"
      subtitle="Manage verification, trips, seats, and payouts."
      nav={driverNav}
    >
      <ActiveCallProvider>
      {/* Active-trip position broadcaster — mounted at layout level
         so the driver's GPS keeps flowing to the rider regardless of
         which page the driver is on (Wallet, Settings, Earnings,
         etc.). Without this, the rider sees the car freeze the moment
         the driver navigates away from /driver/active-trip — a direct
         transparency hit. The provider also exposes the driver +
         rider live positions via `useActiveTripPosition()` so the
         active-trip page consumes them via context instead of
         spinning up its own duplicate watcher. */}
      <ActiveTripPositionProvider>
      <SessionGuard />
      {/* One-time launch warm-up: holds a branded loader until the
         bottom-nav tab chunks + data caches are prefetched, so the
         first tab taps after launch are instant instead of a dead
         few seconds. Native app only; lifts itself after warm-up. */}
      <DriverWarmupGate />
      {/* Watches live connectivity: covers the app with an offline
         screen the moment the connection drops (Capacitor's errorPath
         only catches failed page loads, not a loaded page losing
         signal), and reports a violation if it happens mid-trip. */}
      <ConnectivityMonitor />
      {/* Blocks the driver with a consent modal if they owe acceptance
         of any new or updated policy. The driver-online API enforces
         the same gate server-side. */}
      <LegalConsentGate />
      {/* Submits this device's fraud fingerprint once per session. */}
      <DeviceFingerprintBeacon />
      {/* Listens for incoming voice calls from the active rider and
         pops a toast with Accept / Decline. Subscribes to Supabase
         Realtime on the `calls` table. */}
      <IncomingCallProvider />
      {/* Pull-to-refresh — touch-only, mobile-only. The driver
         portal runs inside the Capacitor WebView where the native
         browser refresh isn't reachable, so the gesture is the only
         way to force a re-fetch. Riders use the browser's native
         refresh instead, so it's not mounted there. */}
      <PullToRefresh />
      {/* Pings /api/driver/heartbeat every 5 minutes while the
         driver is interacting with the portal, and flips them
         offline after 1hr of no interaction. Renders nothing. */}
      <DriverActivityTracker />
      {/* Global driver presence: keeps the GPS stream alive across
         every driver page while the driver is online (not just the
         dashboard), and surfaces a modal if the OS-level location is
         turned off mid-session. Renders nothing until that fires. */}
      <DriverOnlinePresence />
      {/* Client-side gate that bounces verified drivers on the web
         to /driver/download-app (they belong in the native app).
         The server-side getDriverStatus above already handles
         the unverified-redirect-to-pending/onboarding flow. */}
      <DriverPortalGate>{children}</DriverPortalGate>
      </ActiveTripPositionProvider>
      </ActiveCallProvider>
    </PortalLayout>
  );
}
