import { PortalLayout } from "@/components/portal-layout";
import { SessionGuard } from "@/components/session-guard";
import { employerNav } from "@/lib/mock-data";

/**
 * Employer portal layout. Thin wrapper around PortalLayout — no active-
 * call provider, no incoming-call ringer, no legal-consent gate
 * (employers aren't drivers/riders operating trips, so those trip-side
 * primitives don't apply). Kept intentionally lean: employers are
 * field staff whose job is 5–10 min per driver at a taxi hub, not
 * users of the full app.
 */
export default function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalLayout
      title="Employer portal"
      subtitle="Onboard verified drivers on behalf of Rajlo."
      nav={employerNav}
    >
      <SessionGuard />
      {children}
    </PortalLayout>
  );
}
