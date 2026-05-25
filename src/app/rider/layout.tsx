import { PortalLayout } from "@/components/portal-layout";
import { SessionGuard } from "@/components/session-guard";
import { PreferencesProvider } from "@/components/preferences-provider";
import { LegalConsentGate } from "@/components/legal-consent-gate";
import { DeviceFingerprintBeacon } from "@/components/device-fingerprint-beacon";
import { IncomingCallProvider } from "@/components/incoming-call-provider";
import { ActiveCallProvider } from "@/components/active-call-provider";
import { riderNav } from "@/lib/mock-data";

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalLayout
      title="Rider Portal"
      subtitle="Book rides, track trips, and manage safety settings."
      nav={riderNav}
    >
      {/* ActiveCallProvider wraps the entire rider tree so the in-
         call sheet + minimized sticky bar persist across page
         navigation. CallButton + IncomingCallToast push into the
         provider's context; the sheet renders at this level. */}
      <ActiveCallProvider>
        <SessionGuard />
        <PreferencesProvider />
        {/* Blocks the rider with a consent modal if they owe
           acceptance of any new or updated policy. */}
        <LegalConsentGate />
        {/* Submits this device's fraud fingerprint once per session. */}
        <DeviceFingerprintBeacon />
        {/* Full-screen ringer for incoming calls. Accepts route
           into the ActiveCallProvider on tap. */}
        <IncomingCallProvider />
        {children}
      </ActiveCallProvider>
    </PortalLayout>
  );
}