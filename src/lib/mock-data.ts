import type { IconName } from "@/components/icons";

/**
 * `label` is the English fallback shown when no Patois translation
 * exists yet. `labelKey` is the i18n key the sidebar uses to look up
 * the Patois rendering — see `src/lib/i18n.ts` for the dictionary.
 * Always include both so a missing key still renders English instead
 * of an empty space.
 */
export type NavItem = {
  label: string;
  labelKey: string;
  href: string;
  icon: IconName;
};

export const riderNav: NavItem[] = [
  { label: "Dashboard", labelKey: "nav.rider.dashboard", href: "/rider", icon: "home" },
  { label: "Request a ride", labelKey: "nav.rider.request", href: "/rider/request", icon: "plus-circle" },
  { label: "Live trip", labelKey: "nav.rider.liveTrip", href: "/rider/live-trip", icon: "navigation" },
  { label: "Fare breakdown", labelKey: "nav.rider.fare", href: "/rider/fare-breakdown", icon: "calculator" },
  { label: "Payments", labelKey: "nav.rider.payments", href: "/rider/payments", icon: "credit-card" },
  { label: "History", labelKey: "nav.rider.history", href: "/rider/history", icon: "clock" },
  { label: "Spending", labelKey: "nav.rider.spending", href: "/rider/analytics", icon: "bar-chart" },
  { label: "Wallet", labelKey: "nav.rider.wallet", href: "/rider/wallet", icon: "wallet" },
  { label: "QR Pay", labelKey: "nav.rider.qrPay", href: "/rider/qr-pay", icon: "credit-card" },
  { label: "Ratings", labelKey: "nav.rider.ratings", href: "/rider/ratings", icon: "star" },
  // Note: /rider/route-taxi was previously surfaced as a "browse all
  // corridors" page. The mode picker now lives inside /rider/request,
  // so the catalogue is redundant — the page now redirects to /request
  // (or to /rider/route-taxi/live when an active hail exists).
  { label: "Notifications", labelKey: "nav.rider.notifications", href: "/rider/notifications", icon: "bell" },
  { label: "Settings", labelKey: "nav.rider.settings", href: "/rider/settings", icon: "settings" },
  { label: "Support", labelKey: "nav.rider.support", href: "/rider/support", icon: "help-circle" },
  { label: "Safety", labelKey: "nav.rider.safety", href: "/rider/safety", icon: "shield" },
  { label: "Report an incident", labelKey: "nav.rider.report", href: "/rider/report-incident", icon: "shield-alert" },
];

/**
 * Driver portal nav.
 *
 * Removed in the production-ready pass:
 *   - Documents — folded into TA verification (same upload UI, same data)
 *   - Ride requests — the dashboard's inbox feed already shows them live
 *   - Seats — multi-seat is a per-ride request setting on the rider side,
 *             not a driver surface to manage
 *
 * Payouts kept as a "coming soon" stub via the catch-all [screen] route
 * since the payments stack lands later. Earnings (which IS real) covers
 * "what have I earned" until then.
 */
export const driverNav: NavItem[] = [
  { label: "Dashboard", labelKey: "nav.driver.dashboard", href: "/driver", icon: "home" },
  { label: "Live requests", labelKey: "nav.driver.liveRequests", href: "/driver/requests", icon: "inbox" },
  { label: "Route Taxi", labelKey: "nav.driver.routeTaxi", href: "/driver/route-taxi", icon: "navigation" },
  { label: "QR Pay", labelKey: "nav.driver.qrPay", href: "/driver/qr-charge", icon: "credit-card" },
  { label: "TA verification", labelKey: "nav.driver.verification", href: "/driver/verification", icon: "shield-check" },
  { label: "Active trip", labelKey: "nav.driver.activeTrip", href: "/driver/active-trip", icon: "navigation" },
  { label: "Earnings", labelKey: "nav.driver.earnings", href: "/driver/earnings", icon: "trending-up" },
  { label: "Wallet", labelKey: "nav.driver.wallet", href: "/driver/wallet", icon: "wallet" },
  { label: "History", labelKey: "nav.driver.history", href: "/driver/history", icon: "clock" },
  { label: "Ratings", labelKey: "nav.driver.ratings", href: "/driver/ratings", icon: "star" },
  { label: "Notifications", labelKey: "nav.driver.notifications", href: "/driver/notifications", icon: "bell" },
  { label: "Profile", labelKey: "nav.driver.profile", href: "/driver/profile", icon: "user" },
  { label: "Help & safety", labelKey: "nav.driver.support", href: "/driver/help-safety", icon: "shield" },
  { label: "Report an incident", labelKey: "nav.driver.report", href: "/driver/report-incident", icon: "shield-alert" },
  { label: "Settings", labelKey: "nav.driver.settings", href: "/driver/settings", icon: "settings" },
];

// Admin nav stays English-only — admin is internal ops staff who all
// work in English. No labelKey needed; we still satisfy the type by
// pointing at a key that has no Patois translation, so it falls back
// to the English label every time.
//
// Order is meaningful — Operations is the home, then the analytics
// surface, then the live operational pages, then the back-office
// queues. Anything that didn't have real backing tables (parishes,
// fare rules, disputes, payouts, templates, risk alerts) was pulled
// out rather than shipping more "coming soon" placeholders the user
// already flagged as misleading.
export const adminNav: NavItem[] = [
  { label: "Operations", labelKey: "nav.admin.ops", href: "/admin", icon: "home" },
  { label: "Safety", labelKey: "nav.admin.safety", href: "/admin/safety", icon: "shield-alert" },
  { label: "Safety officers", labelKey: "nav.admin.safetyOfficers", href: "/admin/safety-officers", icon: "shield" },
  { label: "Live trips", labelKey: "nav.admin.liveTrips", href: "/admin/live-trips", icon: "map-pin" },
  { label: "Analytics", labelKey: "nav.admin.analytics", href: "/admin/analytics", icon: "bar-chart" },
  { label: "Ride monitoring", labelKey: "nav.admin.monitoring", href: "/admin/ride-monitoring", icon: "activity" },
  { label: "Route Taxi sessions", labelKey: "nav.admin.routeSessions", href: "/admin/route-sessions", icon: "navigation" },
  { label: "Routes catalogue", labelKey: "nav.admin.routes", href: "/admin/routes", icon: "map" },
  { label: "QR charges", labelKey: "nav.admin.qrCharges", href: "/admin/qr-charges", icon: "credit-card" },
  { label: "Riders", labelKey: "nav.admin.users", href: "/admin/users", icon: "users" },
  { label: "Drivers", labelKey: "nav.admin.drivers", href: "/admin/drivers", icon: "user" },
  { label: "Messaging", labelKey: "nav.admin.messages", href: "/admin/messages", icon: "mail" },
  { label: "Verification queue", labelKey: "nav.admin.verification", href: "/admin/verification-queue", icon: "clipboard-check" },
  { label: "Driver violations", labelKey: "nav.admin.violations", href: "/admin/violations", icon: "shield-alert" },
  { label: "Vehicle changes", labelKey: "nav.admin.vehicle", href: "/admin/vehicle-changes", icon: "car" },
  { label: "Wallets", labelKey: "nav.admin.wallets", href: "/admin/wallets", icon: "wallet" },
  { label: "Transactions", labelKey: "nav.admin.transactions", href: "/admin/transactions", icon: "trending-up" },
  { label: "Payouts", labelKey: "nav.admin.payouts", href: "/admin/payouts", icon: "trending-up" },
  { label: "Audit logs", labelKey: "nav.admin.audit", href: "/admin/audit-logs", icon: "history" },
  { label: "Incidents", labelKey: "nav.admin.incidents", href: "/admin/incidents", icon: "shield-alert" },
  { label: "Legal policies", labelKey: "nav.admin.legal", href: "/admin/legal", icon: "file-text" },
  { label: "Fraud & risk", labelKey: "nav.admin.fraud", href: "/admin/fraud", icon: "shield-alert" },
  { label: "Moderation", labelKey: "nav.admin.moderation", href: "/admin/moderation", icon: "shield-check" },
  { label: "Admin security", labelKey: "nav.admin.security", href: "/admin/security", icon: "shield" },
];

/**
 * Safety-officer scoped nav. Officers only see the safety queue and
 * the live trips dashboard (so they can intervene on any in-flight
 * ride). Everything else on the admin surface is admin-only because
 * officers shouldn't be touching wallets, drivers, fare rules, etc.
 */
export const safetyOfficerNav: NavItem[] = [
  { label: "Safety", labelKey: "nav.admin.safety", href: "/admin/safety", icon: "shield-alert" },
  { label: "Live trips", labelKey: "nav.admin.liveTrips", href: "/admin/live-trips", icon: "map-pin" },
];

export const parishes = [
  "Kingston",
  "St. Andrew",
  "St. Catherine",
  "Clarendon",
  "Manchester",
  "St. James",
  "St. Ann",
  "Portland",
];

export const sampleRides = [
  { title: "Half-Way Tree to Papine", meta: "2 seats • 14 mins • JMD 520", status: "info" as const },
  { title: "May Pen to Mandeville", meta: "1 seat • 39 mins • JMD 1,260", status: "good" as const },
  { title: "Montego Bay to Negril", meta: "3 seats • 1h 10m • JMD 2,850", status: "warn" as const },
];

export const verificationQueue = [
  { title: "DRV-1024 • Andre Lewis", meta: "Red Plate 5812 GK • Submitted 34 mins ago", status: "warn" as const },
  { title: "DRV-1031 • Kemar Blake", meta: "Missing COF • Submitted 12 mins ago", status: "info" as const },
  { title: "DRV-0998 • Natalie Brown", meta: "All docs submitted • Awaiting admin review", status: "good" as const },
];

// All required TA documents for red plate PPV drivers
export type DocStatus = "approved" | "pending" | "rejected" | "missing" | "expiring_soon" | "expired";
export type TADocument = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  renewalPeriodDays: number; // 365 = annual
  expiryDate?: string;
  status: DocStatus;
  note?: string;
};

export const requiredTADocuments: TADocument[] = [
  {
    id: "franchise_cert",
    label: "TA Franchise Certificate",
    description: "Route-specific PPV franchise issued by Jamaica Transport Authority. Renewed annually.",
    required: true,
    renewalPeriodDays: 365,
    expiryDate: "2026-08-14",
    status: "approved",
  },
  {
    id: "driver_badge",
    label: "TA Driver Badge / Photo ID",
    description: "Official TA-issued photo identification badge. Must be visibly displayed in vehicle. Renewed annually.",
    required: true,
    renewalPeriodDays: 365,
    expiryDate: "2026-06-30",
    status: "expiring_soon",
    note: "Expires in 94 days — renewal recommended now",
  },
  {
    id: "cof",
    label: "Certificate of Fitness (COF)",
    description: "Annual vehicle inspection pass issued by the TA. Vehicle must pass physical inspection.",
    required: true,
    renewalPeriodDays: 365,
    expiryDate: "2026-05-01",
    status: "expiring_soon",
    note: "Expires in 34 days — book inspection immediately",
  },
  {
    id: "insurance",
    label: "Comprehensive Insurance (PPV)",
    description: "Must cover public passenger vehicle / commercial use, not just third party.",
    required: true,
    renewalPeriodDays: 365,
    expiryDate: "2026-12-01",
    status: "approved",
  },
  {
    id: "drivers_licence_front",
    label: "Driver's Licence — Front",
    description: "Front of the Jamaica driver's licence. Class must permit PPV / taxi operation.",
    required: true,
    renewalPeriodDays: 1825, // 5 years typical
    expiryDate: "2028-03-10",
    status: "approved",
  },
  {
    id: "drivers_licence_back",
    label: "Driver's Licence — Back",
    description: "Back of the Jamaica driver's licence. Same expiry as the front.",
    required: true,
    renewalPeriodDays: 1825,
    expiryDate: "2028-03-10",
    status: "approved",
  },
  {
    id: "police_record",
    label: "Police Record / Good Conduct Certificate",
    description: "Required at initial application and periodically at admin discretion.",
    required: true,
    renewalPeriodDays: 730, // every 2 years
    expiryDate: "2027-01-15",
    status: "approved",
  },
  {
    id: "red_plate_reg",
    label: "Red Plate Vehicle Registration",
    description: "Vehicle registration document confirming PPV red plates.",
    required: true,
    renewalPeriodDays: 365,
    expiryDate: "2026-11-20",
    status: "approved",
  },
  {
    id: "selfie",
    label: "Identity Selfie",
    description: "Live selfie matched against driver licence and TA badge photo.",
    required: true,
    renewalPeriodDays: 0,
    status: "pending",
    note: "Under review",
  },
];

// Compliance timeline for renewal reminders
export const complianceThresholds = {
  warningDays: 60,
  urgentDays: 30,
  criticalDays: 7,
};