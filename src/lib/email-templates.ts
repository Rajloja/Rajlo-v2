import { sendEmail } from "./email";
import {
  renderEmail,
  plaintext,
  APP_URL,
  type EmailSection,
} from "./email-render";

/**
 * Rajlo transactional email templates.
 *
 * Each function returns `{ subject, html, text }` and a paired `sendX(...)`
 * helper that delegates to `sendEmail`. The renderer in `email-render.ts`
 * handles all the visual chrome — these functions only declare *content*.
 *
 * Convention: every send-helper is non-throwing. They return whatever
 * `sendEmail` returns so callers can log + ignore failures rather than
 * blocking the user-facing flow on email delivery.
 */

/* ──────────────────────────────────────────────────────────────────────
   Shared formatters
   ────────────────────────────────────────────────────────────────────── */

const JMD = (n: number) =>
  `JMD ${Math.round(n).toLocaleString("en-JM")}`;

const firstNameOf = (full?: string | null) =>
  (full ?? "").trim().split(/\s+/)[0] || "there";

const fmtDateTime = (iso?: string | Date | null) => {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-JM", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

/* ──────────────────────────────────────────────────────────────────────
   1. Welcome — rider just signed up
   ────────────────────────────────────────────────────────────────────── */

export function welcomeRiderTemplate(args: {
  fullName?: string | null;
}) {
  const first = firstNameOf(args.fullName);
  const subject = "Welcome to Rajlo — Let's go!";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, welcome aboard. You're now part of Jamaica's red-plate ride network — verified PPV drivers, transparent fares, real-time tracking.` },
    {
      type: "card",
      title: "What you can do today",
      rows: [
        { label: "Request a ride", value: "Anywhere across the island" },
        { label: "Share live trip", value: "WhatsApp · iMessage · Slack" },
        { label: "Add trusted contacts", value: "For instant SOS alerts" },
        { label: "Pay from your wallet", value: "Top up · Auto-debit · Zero cash" },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Why Rajlo",
      text: "Every driver is TA-verified and active on a red plate. Every fare is calculated by parish — no surge games, no surprises.",
    },
    { type: "cta", href: `${APP_URL}/rider`, label: "Open my dashboard" },
    { type: "footnote", text: "Need help? Reply to this email and a real person will respond within a few hours." },
  ];

  const html = renderEmail({
    preheader: "Your Rajlo account is ready — book your first ride.",
    eyebrow: "Welcome",
    title: `Welcome to Rajlo, ${first}.`,
    sections,
  });

  const text = plaintext([
    `Hi ${first}, welcome to Rajlo — Jamaica's red-plate ride network.`,
    `Open your dashboard: ${APP_URL}/rider`,
    "Reply to this email if you need help.",
  ]);

  return { subject, html, text };
}

export async function sendWelcomeRiderEmail(to: string, args: { fullName?: string | null }) {
  const t = welcomeRiderTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   2. Welcome — driver just signed up (before onboarding submitted)
   ────────────────────────────────────────────────────────────────────── */

export function welcomeDriverTemplate(args: {
  fullName?: string | null;
}) {
  const first = firstNameOf(args.fullName);
  const subject = "Welcome to Rajlo Driver — let's get you on the road.";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, welcome to the Rajlo driver network. You're a few steps away from earning on Jamaica's red-plate platform.` },
    {
      type: "card",
      title: "Next: complete onboarding",
      rows: [
        { label: "Identity", value: "TRN, ID document, selfie" },
        { label: "Vehicle", value: "Plate, photo, insurance, fitness" },
        { label: "Compliance", value: "PPV badge + driver's licence" },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Review window",
      text: "Once you submit, our operations team reviews within 1–2 business days. We'll email you the moment your account is approved.",
    },
    { type: "cta", href: `${APP_URL}/driver/onboarding`, label: "Continue onboarding" },
    { type: "footnote", text: "Make sure each document is current — we email you 60 / 30 / 7 days before any one expires." },
  ];

  const html = renderEmail({
    preheader: "Finish your driver onboarding to start accepting rides.",
    eyebrow: "Welcome, driver",
    title: `Let's get you on the road, ${first}.`,
    sections,
  });

  const text = plaintext([
    `Hi ${first}, welcome to Rajlo Driver.`,
    `Continue onboarding: ${APP_URL}/driver/onboarding`,
    "Reviews take 1–2 business days. We'll email you when you're approved.",
  ]);

  return { subject, html, text };
}

export async function sendWelcomeDriverEmail(to: string, args: { fullName?: string | null }) {
  const t = welcomeDriverTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   3. Driver onboarding submitted
   ────────────────────────────────────────────────────────────────────── */

export function driverOnboardingSubmittedTemplate(args: {
  driverName: string;
  externalId: string;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "We've got your application — review in progress";

  const sections: EmailSection[] = [
    { type: "intro", text: `Thanks ${first} — your driver application is in. Our operations team has it under review.` },
    {
      type: "card",
      title: "Application receipt",
      rows: [
        { label: "Driver ID", value: args.externalId },
        { label: "Status", value: "In review" },
        { label: "Decision by", value: "1–2 business days", emphasize: true },
      ],
    },
    { type: "paragraph", text: "We'll verify your TRN, plate, insurance, fitness, and PPV badge against the Transport Authority record. You don't need to do anything else right now." },
    { type: "highlight", tone: "warning", eyebrow: "If we need anything", text: "If a document is unclear or expired, we'll email you with exactly what to fix and you can resubmit in one tap." },
    { type: "cta", href: `${APP_URL}/auth/driver/login`, label: "Check status" },
  ];

  const html = renderEmail({
    preheader: `Application ${args.externalId} received. Decision in 1–2 business days.`,
    eyebrow: "Application received",
    title: "We're reviewing your application.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, your Rajlo driver application (${args.externalId}) was received and is in review.`,
    "Decision in 1–2 business days. No action needed unless we email you for changes.",
    `Check status: ${APP_URL}/auth/driver/login`,
  ]);

  return { subject, html, text };
}

export async function sendDriverOnboardingSubmittedEmail(
  to: string,
  args: { driverName: string; externalId: string },
) {
  const t = driverOnboardingSubmittedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   4. Driver approved
   ────────────────────────────────────────────────────────────────────── */

export function driverApprovedTemplate(args: {
  driverName: string;
  externalId: string;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "You're approved — your Rajlo driver account is live";

  const sections: EmailSection[] = [
    { type: "intro", text: `Welcome to the road, ${first}. All your TA documents have been verified and your driver account is now active.` },
    {
      type: "highlight",
      tone: "positive",
      eyebrow: "Account activated",
      text: `Driver ID <strong>${args.externalId}</strong> · Ready to accept rides`,
    },
    {
      type: "card",
      title: "Your first 24 hours",
      rows: [
        { label: "Sign in", value: "Driver portal" },
        { label: "Toggle", value: "Online" },
        { label: "Earn", value: "Per-trip JMD payouts" },
      ],
    },
    { type: "cta", href: `${APP_URL}/auth/driver/login`, label: "Open driver portal" },
    { type: "footnote", text: "Keep documents current — your account auto-suspends if any expire. We'll email you 60 / 30 / 7 days before each expiry." },
  ];

  const html = renderEmail({
    preheader: "Your Rajlo driver account is now active.",
    eyebrow: "Approved",
    title: `You're approved, ${first}.`,
    sections,
  });

  const text = plaintext([
    `Approved! Driver ID ${args.externalId} is now active.`,
    `Sign in: ${APP_URL}/auth/driver/login`,
    "Keep documents current — we'll email expiry warnings.",
  ]);

  return { subject, html, text };
}

export async function sendDriverApprovedEmailV2(
  to: string,
  args: { driverName: string; externalId: string },
) {
  const t = driverApprovedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   5. Driver rejected — resubmission required
   ────────────────────────────────────────────────────────────────────── */

export function driverRejectedTemplate(args: {
  driverName: string;
  externalId: string;
  adminNote?: string | null;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "Action needed on your Rajlo driver application";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first} — your application needs a few changes before we can activate your account. We re-review within 1–2 business days of resubmission.` },
    {
      type: "highlight",
      tone: "warning",
      eyebrow: "Resubmission required",
      text: `Driver ID <strong>${args.externalId}</strong>`,
    },
    ...(args.adminNote
      ? [
          {
            type: "highlight" as const,
            tone: "danger" as const,
            eyebrow: "Note from operations",
            text: args.adminNote,
          },
        ]
      : []),
    { type: "paragraph", text: "Sign in and click <strong>Resubmit documents</strong>. Your form fields and previously-approved files are saved — you only need to re-upload what's flagged." },
    { type: "cta", href: `${APP_URL}/auth/driver/login`, label: "Resubmit documents" },
    { type: "footnote", text: "Questions about TA requirements? Reply here, or call the Transport Authority on 876-926-9937." },
  ];

  const html = renderEmail({
    preheader: "We need a few changes before activating your account.",
    eyebrow: "Action needed",
    title: `${first}, your application needs changes.`,
    sections,
  });

  const text = plaintext([
    `Hi ${first}, your Rajlo driver application (${args.externalId}) needs changes.`,
    args.adminNote ? `Note from operations: ${args.adminNote}` : "",
    `Sign in to resubmit: ${APP_URL}/auth/driver/login`,
  ]);

  return { subject, html, text };
}

export async function sendDriverRejectedEmailV2(
  to: string,
  args: { driverName: string; externalId: string; adminNote?: string | null },
) {
  const t = driverRejectedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   6. Driver deactivated
   ────────────────────────────────────────────────────────────────────── */

export function driverDeactivatedTemplate(args: {
  driverName: string;
  externalId: string;
  reason?: string | null;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "Your Rajlo driver account has been deactivated";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first} — your Rajlo driver account has been deactivated and is back under review. You won't be able to accept ride requests until our team re-verifies your application.` },
    {
      type: "highlight",
      tone: "warning",
      eyebrow: "Status",
      text: `Driver ID <strong>${args.externalId}</strong> · Documents reset to pending review`,
    },
    ...(args.reason
      ? [
          {
            type: "highlight" as const,
            tone: "danger" as const,
            eyebrow: "Reason",
            text: args.reason,
          },
        ]
      : []),
    { type: "paragraph", text: "Sign in to see what's needed. Our operations team will reach out if any documents need to be replaced or refreshed." },
    { type: "cta", href: `${APP_URL}/auth/driver/login`, label: "Open driver portal" },
  ];

  const html = renderEmail({
    preheader: "Your Rajlo driver account has been deactivated.",
    eyebrow: "Deactivated",
    title: "Account deactivated",
    sections,
  });

  const text = plaintext([
    `Your Rajlo driver account (${args.externalId}) has been deactivated.`,
    args.reason ? `Reason: ${args.reason}` : "",
    `Sign in: ${APP_URL}/auth/driver/login`,
  ]);

  return { subject, html, text };
}

export async function sendDriverDeactivatedEmailV2(
  to: string,
  args: { driverName: string; externalId: string; reason?: string | null },
) {
  const t = driverDeactivatedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   7. Ride requested — rider sent their booking
   ────────────────────────────────────────────────────────────────────── */

export function rideRequestedTemplate(args: {
  riderFirstName?: string | null;
  rideId: string;
  pickup: string;
  dropoff: string;
  fareJMD: number;
  seats: number;
  etaMinutes?: number | null;
  expiresAt?: string | Date | null;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject = "Looking for a driver…";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, your ride request is live and we're matching you with a nearby red-plate driver.` },
    {
      type: "card",
      title: "Trip request",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        { label: "Seats", value: String(args.seats) },
        { label: "Fare", value: JMD(args.fareJMD), emphasize: true },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "What happens next",
      text: args.expiresAt
        ? `We'll keep searching until ${fmtDateTime(args.expiresAt)}. If no driver is found by then, you can retry instantly with no charge.`
        : "We'll keep searching for an available driver. You can cancel any time before pickup with no charge.",
    },
    { type: "cta", href: `${APP_URL}/rider/live-trip?id=${args.rideId}`, label: "View live status" },
    { type: "footnote", text: "Sit tight — most matches happen within 30–60 seconds across the Corporate Area." },
  ];

  const html = renderEmail({
    preheader: `Looking for a driver for your trip to ${args.dropoff}.`,
    eyebrow: "Ride requested",
    title: "We're finding your driver.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, ride requested.`,
    `${args.pickup} → ${args.dropoff} · ${JMD(args.fareJMD)} · ${args.seats} seat${args.seats > 1 ? "s" : ""}`,
    `Track live: ${APP_URL}/rider/live-trip?id=${args.rideId}`,
  ]);

  return { subject, html, text };
}

export async function sendRideRequestedEmail(to: string, args: Parameters<typeof rideRequestedTemplate>[0]) {
  const t = rideRequestedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   8. Driver matched — driver accepted the ride
   ────────────────────────────────────────────────────────────────────── */

export function driverMatchedTemplate(args: {
  riderFirstName?: string | null;
  rideId: string;
  driverName: string;
  vehicle?: string | null;
  plate?: string | null;
  etaMinutes?: number | null;
  pickup: string;
  dropoff: string;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject = `${args.driverName.split(" ")[0] || "Your driver"} is on the way`;

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, you're matched. Your driver is heading to your pickup now.` },
    {
      type: "card",
      title: "Driver",
      rows: [
        { label: "Name", value: args.driverName },
        ...(args.vehicle ? [{ label: "Vehicle", value: args.vehicle }] : []),
        ...(args.plate ? [{ label: "Plate", value: args.plate, emphasize: true }] : []),
        ...(args.etaMinutes != null
          ? [{ label: "ETA", value: `~${args.etaMinutes} min`, emphasize: true }]
          : []),
      ],
    },
    {
      type: "card",
      title: "Trip",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Safety",
      text: "Confirm the plate before stepping in. Share your live trip link with anyone you trust — we expire it the moment your trip ends.",
    },
    { type: "cta", href: `${APP_URL}/rider/live-trip?id=${args.rideId}`, label: "Track on map" },
  ];

  const html = renderEmail({
    preheader: `${args.driverName} is heading to ${args.pickup}.`,
    eyebrow: "Driver matched",
    title: "Your driver is on the way.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, you're matched with ${args.driverName}.`,
    args.plate ? `Plate: ${args.plate}` : "",
    args.etaMinutes != null ? `ETA: ~${args.etaMinutes} min` : "",
    `Track: ${APP_URL}/rider/live-trip?id=${args.rideId}`,
  ]);

  return { subject, html, text };
}

export async function sendDriverMatchedEmail(to: string, args: Parameters<typeof driverMatchedTemplate>[0]) {
  const t = driverMatchedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   9. Trip completed — receipt + rate prompt
   ────────────────────────────────────────────────────────────────────── */

export function tripCompletedTemplate(args: {
  riderFirstName?: string | null;
  rideId: string;
  pickup: string;
  dropoff: string;
  fareJMD: number;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  driverName?: string | null;
  completedAt?: string | Date | null;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject = `Trip receipt · ${JMD(args.fareJMD)} · ${args.dropoff}`;

  const sections: EmailSection[] = [
    { type: "intro", text: `Thanks for riding with Rajlo, ${first}. Here's your receipt.` },
    {
      type: "card",
      title: "Receipt",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        ...(args.driverName ? [{ label: "Driver", value: args.driverName }] : []),
        ...(args.distanceKm != null
          ? [{ label: "Distance", value: `${args.distanceKm.toFixed(1)} km` }]
          : []),
        ...(args.durationMinutes != null
          ? [{ label: "Duration", value: `${args.durationMinutes} min` }]
          : []),
        ...(args.completedAt
          ? [{ label: "Completed", value: fmtDateTime(args.completedAt) }]
          : []),
        { label: "Total", value: JMD(args.fareJMD), emphasize: true },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Rate your trip",
      text: "Your rating helps keep the network safe and reliable for everyone. It takes 5 seconds.",
    },
    { type: "cta", href: `${APP_URL}/rider/history/${args.rideId}?rate=1`, label: "Rate this trip" },
    { type: "footnote", text: `Need a corrected receipt for expenses? Reply with trip ID ${args.rideId}.` },
  ];

  const html = renderEmail({
    preheader: `Receipt for ${JMD(args.fareJMD)} · ${args.pickup} → ${args.dropoff}`,
    eyebrow: "Trip complete",
    title: "Thanks for riding with Rajlo.",
    sections,
  });

  const text = plaintext([
    `Thanks ${first}.`,
    `${args.pickup} → ${args.dropoff}`,
    `Total: ${JMD(args.fareJMD)}`,
    `Rate trip: ${APP_URL}/rider/history/${args.rideId}?rate=1`,
  ]);

  return { subject, html, text };
}

export async function sendTripCompletedEmail(to: string, args: Parameters<typeof tripCompletedTemplate>[0]) {
  const t = tripCompletedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   10. Trip cancelled — by rider or driver
   ────────────────────────────────────────────────────────────────────── */

export function tripCancelledTemplate(args: {
  riderFirstName?: string | null;
  rideId: string;
  pickup: string;
  dropoff: string;
  cancelledBy: "rider" | "driver" | "system";
  reason?: string | null;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject =
    args.cancelledBy === "rider"
      ? "Trip cancelled — confirmation"
      : args.cancelledBy === "driver"
        ? "Your driver had to cancel"
        : "Trip cancelled";

  const headline =
    args.cancelledBy === "rider"
      ? "We've cancelled your trip."
      : args.cancelledBy === "driver"
        ? "Your driver cancelled."
        : "Your trip was cancelled.";

  const sections: EmailSection[] = [
    {
      type: "intro",
      text:
        args.cancelledBy === "rider"
          ? `Hi ${first}, we've cancelled your trip as requested. No charge.`
          : args.cancelledBy === "driver"
            ? `Hi ${first}, sorry — your driver had to cancel before pickup. You can re-request a ride and we'll match you with another driver right away. No charge.`
            : `Hi ${first}, your trip was cancelled. No charge.`,
    },
    {
      type: "card",
      title: "Trip",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        {
          label: "Cancelled by",
          value:
            args.cancelledBy === "rider"
              ? "You"
              : args.cancelledBy === "driver"
                ? "Driver"
                : "Rajlo",
        },
      ],
    },
    ...(args.reason
      ? [
          {
            type: "highlight" as const,
            tone: "neutral" as const,
            eyebrow: "Reason",
            text: args.reason,
          },
        ]
      : []),
    { type: "cta", href: `${APP_URL}/rider`, label: "Request another ride" },
  ];

  const html = renderEmail({
    preheader: "No charge — re-request whenever you're ready.",
    eyebrow: "Trip cancelled",
    title: headline,
    sections,
  });

  const text = plaintext([
    `${headline}`,
    `${args.pickup} → ${args.dropoff}`,
    args.reason ? `Reason: ${args.reason}` : "",
    `Re-request: ${APP_URL}/rider`,
  ]);

  return { subject, html, text };
}

export async function sendTripCancelledEmail(to: string, args: Parameters<typeof tripCancelledTemplate>[0]) {
  const t = tripCancelledTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   11. No driver found — request expired
   ────────────────────────────────────────────────────────────────────── */

export function noDriverFoundTemplate(args: {
  riderFirstName?: string | null;
  rideId: string;
  pickup: string;
  dropoff: string;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject = "We couldn't find a driver — try again?";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, we searched but no red-plate driver was available for your route. No charge.` },
    {
      type: "card",
      title: "Request",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
      ],
    },
    {
      type: "highlight",
      tone: "warning",
      eyebrow: "Try again",
      text: "Driver availability moves in 1–2 minute windows. Re-requesting often matches you on the next attempt.",
    },
    { type: "cta", href: `${APP_URL}/rider?retry=${args.rideId}`, label: "Re-request now" },
  ];

  const html = renderEmail({
    preheader: "No driver available — re-request to try again, no charge.",
    eyebrow: "No driver found",
    title: "We couldn't find a driver in time.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, no driver was available for ${args.pickup} → ${args.dropoff}.`,
    `Re-request: ${APP_URL}/rider?retry=${args.rideId}`,
  ]);

  return { subject, html, text };
}

export async function sendNoDriverFoundEmail(to: string, args: Parameters<typeof noDriverFoundTemplate>[0]) {
  const t = noDriverFoundTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   12. Vehicle change submitted (driver-side)
   ────────────────────────────────────────────────────────────────────── */

export function vehicleChangeSubmittedTemplate(args: {
  driverName: string;
  externalId: string;
  newVehicle: string;
  newPlate: string;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "We've got your vehicle change — review in progress";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, your vehicle change request has been received. Operations will review the new documents within 1–2 business days.` },
    {
      type: "card",
      title: "Submitted change",
      rows: [
        { label: "Driver ID", value: args.externalId },
        { label: "New vehicle", value: args.newVehicle },
        { label: "New plate", value: args.newPlate, emphasize: true },
        { label: "Status", value: "In review" },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "While we review",
      text: "Continue accepting rides on your current vehicle. We'll switch your active vehicle the moment the change is approved.",
    },
    { type: "cta", href: `${APP_URL}/auth/driver/login`, label: "Open driver portal" },
  ];

  const html = renderEmail({
    preheader: `Vehicle change for ${args.newPlate} is in review.`,
    eyebrow: "Vehicle change",
    title: "Vehicle change in review.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, your vehicle change to ${args.newVehicle} (${args.newPlate}) is in review.`,
    "Decision in 1–2 business days.",
    `Portal: ${APP_URL}/auth/driver/login`,
  ]);

  return { subject, html, text };
}

export async function sendVehicleChangeSubmittedEmail(
  to: string,
  args: Parameters<typeof vehicleChangeSubmittedTemplate>[0],
) {
  const t = vehicleChangeSubmittedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   13. Vehicle change approved
   ────────────────────────────────────────────────────────────────────── */

export function vehicleChangeApprovedTemplate(args: {
  driverName: string;
  externalId: string;
  newVehicle: string;
  newPlate: string;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "Your vehicle change is approved — you're all set";

  const sections: EmailSection[] = [
    { type: "intro", text: `Good news, ${first}. Your new vehicle is verified and active on your Rajlo account.` },
    {
      type: "highlight",
      tone: "positive",
      eyebrow: "Approved",
      text: `Driver ID <strong>${args.externalId}</strong> · New plate <strong>${args.newPlate}</strong> is live`,
    },
    {
      type: "card",
      title: "Active vehicle",
      rows: [
        { label: "Vehicle", value: args.newVehicle },
        { label: "Plate", value: args.newPlate, emphasize: true },
      ],
    },
    { type: "cta", href: `${APP_URL}/auth/driver/login`, label: "Start accepting rides" },
  ];

  const html = renderEmail({
    preheader: `Your new plate ${args.newPlate} is live.`,
    eyebrow: "Vehicle approved",
    title: `${args.newPlate} is live.`,
    sections,
  });

  const text = plaintext([
    `Approved! Your new vehicle (${args.newVehicle}, plate ${args.newPlate}) is now active.`,
    `Sign in: ${APP_URL}/auth/driver/login`,
  ]);

  return { subject, html, text };
}

export async function sendVehicleChangeApprovedEmail(
  to: string,
  args: Parameters<typeof vehicleChangeApprovedTemplate>[0],
) {
  const t = vehicleChangeApprovedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   14. Vehicle change rejected
   ────────────────────────────────────────────────────────────────────── */

export function vehicleChangeRejectedTemplate(args: {
  driverName: string;
  externalId: string;
  newPlate: string;
  adminNote?: string | null;
}) {
  const first = firstNameOf(args.driverName);
  const subject = "Vehicle change needs changes";

  const sections: EmailSection[] = [
    { type: "intro", text: `Hi ${first}, we couldn't approve your vehicle change as submitted. Resubmit with the corrections below and we'll re-review.` },
    {
      type: "highlight",
      tone: "warning",
      eyebrow: "Resubmission required",
      text: `Driver ID <strong>${args.externalId}</strong> · Plate <strong>${args.newPlate}</strong>`,
    },
    ...(args.adminNote
      ? [
          {
            type: "highlight" as const,
            tone: "danger" as const,
            eyebrow: "Note from operations",
            text: args.adminNote,
          },
        ]
      : []),
    { type: "paragraph", text: "Sign in and resubmit the vehicle change form. Your current vehicle stays active until the new one is approved." },
    { type: "cta", href: `${APP_URL}/driver/vehicle-change`, label: "Resubmit change" },
  ];

  const html = renderEmail({
    preheader: "Resubmit your vehicle change with the corrections inside.",
    eyebrow: "Vehicle change",
    title: "Your vehicle change needs changes.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, your vehicle change for plate ${args.newPlate} needs changes.`,
    args.adminNote ? `Note: ${args.adminNote}` : "",
    `Resubmit: ${APP_URL}/driver/vehicle-change`,
  ]);

  return { subject, html, text };
}

export async function sendVehicleChangeRejectedEmail(
  to: string,
  args: Parameters<typeof vehicleChangeRejectedTemplate>[0],
) {
  const t = vehicleChangeRejectedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   15. Ride accepted (driver-side confirmation)
   ────────────────────────────────────────────────────────────────────── */

export function driverRideAcceptedTemplate(args: {
  driverName: string;
  rideId: string;
  riderFirstName?: string | null;
  pickup: string;
  dropoff: string;
  fareJMD: number;
  seats: number;
}) {
  const first = firstNameOf(args.driverName);
  const riderLabel = args.riderFirstName?.trim() || "your rider";
  const subject = `Ride accepted · ${args.pickup} → ${args.dropoff}`;

  const sections: EmailSection[] = [
    { type: "intro", text: `Heads up, ${first} — you've claimed a new trip. Head to pickup and tap "I've arrived" when you're outside.` },
    {
      type: "card",
      title: "Trip details",
      rows: [
        { label: "Rider", value: riderLabel },
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        { label: "Seats", value: String(args.seats) },
        { label: "Fare", value: JMD(args.fareJMD), emphasize: true },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Safety reminder",
      text: "Confirm the rider's name before they get in. If anything feels off, you can cancel from the active-trip screen with no penalty before the trip starts.",
    },
    { type: "cta", href: `${APP_URL}/driver/active-trip`, label: "Open active trip" },
  ];

  const html = renderEmail({
    preheader: `Trip from ${args.pickup} to ${args.dropoff} · ${JMD(args.fareJMD)}`,
    eyebrow: "Ride accepted",
    title: `${args.pickup} → ${args.dropoff}`,
    sections,
  });

  const text = plaintext([
    `Hi ${first}, you accepted a ride.`,
    `${args.pickup} → ${args.dropoff} · ${JMD(args.fareJMD)} · ${args.seats} seat${args.seats > 1 ? "s" : ""}`,
    `Open active trip: ${APP_URL}/driver/active-trip`,
  ]);

  return { subject, html, text };
}

export async function sendDriverRideAcceptedEmail(
  to: string,
  args: Parameters<typeof driverRideAcceptedTemplate>[0],
) {
  const t = driverRideAcceptedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   16. Trip completed (driver-side earnings receipt)
   ────────────────────────────────────────────────────────────────────── */

export function driverTripCompletedTemplate(args: {
  driverName: string;
  rideId: string;
  pickup: string;
  dropoff: string;
  fareJMD: number;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  riderFirstName?: string | null;
  completedAt?: string | Date | null;
}) {
  const first = firstNameOf(args.driverName);
  const subject = `Trip earnings · ${JMD(args.fareJMD)} · ${args.dropoff}`;

  const sections: EmailSection[] = [
    { type: "intro", text: `Nice work, ${first}. The trip wrapped clean — here's your earnings record.` },
    {
      type: "card",
      title: "Earnings",
      rows: [
        { label: "Earned", value: JMD(args.fareJMD), emphasize: true },
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        ...(args.riderFirstName
          ? [{ label: "Rider", value: args.riderFirstName }]
          : []),
        ...(args.distanceKm != null
          ? [{ label: "Distance", value: `${args.distanceKm.toFixed(1)} km` }]
          : []),
        ...(args.durationMinutes != null
          ? [{ label: "Duration", value: `${args.durationMinutes} min` }]
          : []),
        ...(args.completedAt
          ? [{ label: "Completed", value: fmtDateTime(args.completedAt) }]
          : []),
      ],
    },
    {
      type: "highlight",
      tone: "positive",
      eyebrow: "Logged",
      text: "This trip is now in your earnings dashboard. Payouts run weekly — Friday cut-off, money lands the next business day.",
    },
    { type: "cta", href: `${APP_URL}/driver/earnings`, label: "Open earnings" },
    { type: "footnote", text: `Need a corrected receipt? Reply with trip ID ${args.rideId}.` },
  ];

  const html = renderEmail({
    preheader: `${JMD(args.fareJMD)} earned · ${args.pickup} → ${args.dropoff}`,
    eyebrow: "Trip complete",
    title: `${JMD(args.fareJMD)} earned`,
    sections,
  });

  const text = plaintext([
    `Trip done. Earned ${JMD(args.fareJMD)}.`,
    `${args.pickup} → ${args.dropoff}`,
    `Open earnings: ${APP_URL}/driver/earnings`,
  ]);

  return { subject, html, text };
}

export async function sendDriverTripCompletedEmail(
  to: string,
  args: Parameters<typeof driverTripCompletedTemplate>[0],
) {
  const t = driverTripCompletedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ──────────────────────────────────────────────────────────────────────
   N. Wallet transfer OTP
   ────────────────────────────────────────────────────────────────────── */

export function walletTransferOtpTemplate(args: {
  code: string;
  amountJmd: number;
  recipientLabel: string;
  expiresInMinutes: number;
  senderName?: string | null;
}) {
  const first = firstNameOf(args.senderName);
  const subject = `Your Rajlo wallet code: ${args.code}`;

  const sections: EmailSection[] = [
    {
      type: "intro",
      text: `Hi ${first}, you're sending JMD ${args.amountJmd.toLocaleString("en-JM")} to ${args.recipientLabel} from your Rajlo wallet. Use the code below to confirm.`,
    },
    {
      type: "code",
      value: args.code,
      description: `Expires in ${args.expiresInMinutes} minutes.`,
    },
    {
      type: "highlight",
      tone: "warning",
      eyebrow: "Didn't try to send money?",
      text: "Don't share this code with anyone. Cancel the transfer from your Rajlo wallet immediately, and reply to this email so our team can check the activity on your account.",
    },
    {
      type: "footnote",
      text: "Rajlo will never ask you to read out a code over the phone. If anyone — including someone claiming to be Rajlo support — does, end the call.",
    },
  ];

  const html = renderEmail({
    preheader: `Confirm sending JMD ${args.amountJmd.toLocaleString("en-JM")} to ${args.recipientLabel}.`,
    eyebrow: "Wallet transfer",
    title: "Confirm your transfer",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, your Rajlo wallet transfer code is: ${args.code}`,
    `Sending JMD ${args.amountJmd.toLocaleString("en-JM")} to ${args.recipientLabel}.`,
    `This code expires in ${args.expiresInMinutes} minutes.`,
    "If you didn't try to send money, do not share this code. Cancel from your Rajlo wallet and contact support.",
  ]);

  return { subject, html, text };
}

export async function sendWalletTransferOtpEmail(
  to: string,
  args: Parameters<typeof walletTransferOtpTemplate>[0],
) {
  const t = walletTransferOtpTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ══════════════════════════════════════════════════════════════════════
   ROUTE TAXI (Mode B) — parity with private-ride emails above.

   Six transactional emails — three for the rider, three for the driver.
   The rider sees: hail requested → driver matched → trip receipt, plus
   a cancellation note when either side bails. The driver sees: hail
   accepted (confirmation of their tap) → earnings receipt.

   Copy is route-taxi-aware: we call out the corridor, mention the
   shared-vehicle nature, and point CTAs at /rider/route-taxi/live
   (not /rider/live-trip) so the recipient lands on the right surface.
   ══════════════════════════════════════════════════════════════════════ */

/* ── R1. Rider — hail requested ── */

export function riderHailRequestedTemplate(args: {
  riderFirstName?: string | null;
  hailId: string;
  routeOrigin: string;
  routeDestination: string;
  pickup: string;
  dropoff: string;
  fareJMD: number;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject = `Looking for a route taxi · ${args.routeOrigin} → ${args.routeDestination}`;

  const sections: EmailSection[] = [
    {
      type: "intro",
      text: `Hi ${first}, your route taxi hail is live. We're broadcasting it to every driver currently running the ${args.routeOrigin} → ${args.routeDestination} corridor.`,
    },
    {
      type: "card",
      title: "Hail",
      rows: [
        { label: "Corridor", value: `${args.routeOrigin} → ${args.routeDestination}` },
        { label: "Pickup", value: args.pickup },
        { label: "Dropoff", value: args.dropoff },
        { label: "Fare", value: JMD(args.fareJMD), emphasize: true },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "What happens next",
      text: "The first driver on the corridor to tap accept wins the hail. You'll get a notification with their plate + vehicle so you can flag them at the kerbside.",
    },
    {
      type: "cta",
      href: `${APP_URL}/rider/route-taxi/live?id=${args.hailId}`,
      label: "View live status",
    },
    {
      type: "footnote",
      text: "Route taxis seat multiple riders — your fare is flat per corridor, not per minute.",
    },
  ];

  const html = renderEmail({
    preheader: `Hailing a route taxi on the ${args.routeOrigin} → ${args.routeDestination} corridor.`,
    eyebrow: "Route taxi hailed",
    title: "Looking for a driver.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, route taxi hailed.`,
    `${args.routeOrigin} → ${args.routeDestination} · ${JMD(args.fareJMD)}`,
    `Track live: ${APP_URL}/rider/route-taxi/live?id=${args.hailId}`,
  ]);

  return { subject, html, text };
}

export async function sendRiderHailRequestedEmail(
  to: string,
  args: Parameters<typeof riderHailRequestedTemplate>[0],
) {
  const t = riderHailRequestedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ── R2. Rider — driver accepted the hail ── */

export function riderHailAcceptedTemplate(args: {
  riderFirstName?: string | null;
  hailId: string;
  driverName: string;
  vehicle?: string | null;
  plate?: string | null;
  pickup: string;
  dropoff: string;
}) {
  const first = firstNameOf(args.riderFirstName);
  const driverFirst = args.driverName.split(" ")[0] || "Your driver";
  const subject = `${driverFirst} is coming through your corridor`;

  const sections: EmailSection[] = [
    {
      type: "intro",
      text: `Hi ${first}, a driver picked up your route taxi hail. They're already on the corridor — wave them down at ${args.pickup} when you spot the plate.`,
    },
    {
      type: "card",
      title: "Driver",
      rows: [
        { label: "Name", value: args.driverName },
        ...(args.vehicle ? [{ label: "Vehicle", value: args.vehicle }] : []),
        ...(args.plate ? [{ label: "Plate", value: args.plate, emphasize: true }] : []),
      ],
    },
    {
      type: "card",
      title: "Trip",
      rows: [
        { label: "Pickup", value: args.pickup },
        { label: "Dropoff", value: args.dropoff },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Spotting tip",
      text: "Route taxis are shared — there may be other riders onboard. Confirm the plate before stepping in.",
    },
    {
      type: "cta",
      href: `${APP_URL}/rider/route-taxi/live?id=${args.hailId}`,
      label: "Track on map",
    },
  ];

  const html = renderEmail({
    preheader: `${args.driverName} is heading to ${args.pickup}.`,
    eyebrow: "Driver matched",
    title: "Your route taxi is on the way.",
    sections,
  });

  const text = plaintext([
    `Hi ${first}, ${args.driverName} accepted your hail.`,
    args.plate ? `Plate: ${args.plate}` : "",
    `Track: ${APP_URL}/rider/route-taxi/live?id=${args.hailId}`,
  ]);

  return { subject, html, text };
}

export async function sendRiderHailAcceptedEmail(
  to: string,
  args: Parameters<typeof riderHailAcceptedTemplate>[0],
) {
  const t = riderHailAcceptedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ── R3. Rider — trip completed (receipt) ── */

export function riderHailCompletedTemplate(args: {
  riderFirstName?: string | null;
  hailId: string;
  pickup: string;
  dropoff: string;
  fareJMD: number;
  distanceKm?: number | null;
  driverName?: string | null;
  completedAt?: string | Date | null;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject = `Route taxi receipt · ${JMD(args.fareJMD)} · ${args.dropoff}`;

  const sections: EmailSection[] = [
    {
      type: "intro",
      text: `Thanks for riding with Rajlo, ${first}. Your route taxi trip is wrapped — here's your receipt.`,
    },
    {
      type: "card",
      title: "Receipt",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        ...(args.driverName ? [{ label: "Driver", value: args.driverName }] : []),
        ...(args.distanceKm != null
          ? [{ label: "Distance", value: `${args.distanceKm.toFixed(1)} km` }]
          : []),
        ...(args.completedAt
          ? [{ label: "Completed", value: fmtDateTime(args.completedAt) }]
          : []),
        { label: "Total", value: JMD(args.fareJMD), emphasize: true },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "Cashless trip",
      text: "Your wallet was charged the flat corridor fare — no haggling, no change, no surprises.",
    },
    {
      type: "cta",
      href: `${APP_URL}/rider/route-taxi/history/${args.hailId}`,
      label: "View trip details",
    },
    {
      type: "footnote",
      text: `Need a corrected receipt for expenses? Reply with hail ID ${args.hailId}.`,
    },
  ];

  const html = renderEmail({
    preheader: `Receipt for ${JMD(args.fareJMD)} · ${args.pickup} → ${args.dropoff}`,
    eyebrow: "Trip complete",
    title: "Thanks for riding with Rajlo.",
    sections,
  });

  const text = plaintext([
    `Thanks ${first}.`,
    `${args.pickup} → ${args.dropoff}`,
    `Total: ${JMD(args.fareJMD)}`,
    `Receipt: ${APP_URL}/rider/route-taxi/history/${args.hailId}`,
  ]);

  return { subject, html, text };
}

export async function sendRiderHailCompletedEmail(
  to: string,
  args: Parameters<typeof riderHailCompletedTemplate>[0],
) {
  const t = riderHailCompletedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ── R4. Rider — hail cancelled (by self or driver) ── */

export function riderHailCancelledTemplate(args: {
  riderFirstName?: string | null;
  hailId: string;
  pickup: string;
  dropoff: string;
  cancelledBy: "rider" | "driver" | "system";
  reason?: string | null;
  cancellationFeeJmd?: number | null;
}) {
  const first = firstNameOf(args.riderFirstName);
  const subject =
    args.cancelledBy === "rider"
      ? "Route taxi cancelled — confirmation"
      : args.cancelledBy === "driver"
        ? "Your route taxi driver had to cancel"
        : "Route taxi cancelled";

  const headline =
    args.cancelledBy === "rider"
      ? "We've cancelled your route taxi hail."
      : args.cancelledBy === "driver"
        ? "Your route taxi driver cancelled."
        : "Your route taxi was cancelled.";

  const introBody =
    args.cancelledBy === "rider"
      ? args.cancellationFeeJmd && args.cancellationFeeJmd > 0
        ? `Hi ${first}, we've cancelled your hail as requested. A ${JMD(args.cancellationFeeJmd)} cancellation fee was charged because a driver had already accepted.`
        : `Hi ${first}, we've cancelled your hail as requested. No charge.`
      : args.cancelledBy === "driver"
        ? `Hi ${first}, sorry — your driver had to cancel before pickup. Re-hail any time and we'll find you another route taxi on the same corridor. No charge.`
        : `Hi ${first}, your hail was cancelled. No charge.`;

  const sections: EmailSection[] = [
    { type: "intro", text: introBody },
    {
      type: "card",
      title: "Hail",
      rows: [
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        {
          label: "Cancelled by",
          value:
            args.cancelledBy === "rider"
              ? "You"
              : args.cancelledBy === "driver"
                ? "Driver"
                : "Rajlo",
        },
        ...(args.cancellationFeeJmd && args.cancellationFeeJmd > 0
          ? [
              {
                label: "Cancellation fee",
                value: JMD(args.cancellationFeeJmd),
                emphasize: true,
              },
            ]
          : []),
      ],
    },
    ...(args.reason
      ? [
          {
            type: "highlight" as const,
            tone: "neutral" as const,
            eyebrow: "Reason",
            text: args.reason,
          },
        ]
      : []),
    { type: "cta", href: `${APP_URL}/rider/request`, label: "Hail another route taxi" },
  ];

  const html = renderEmail({
    preheader: "No charge — re-hail whenever you're ready.",
    eyebrow: "Hail cancelled",
    title: headline,
    sections,
  });

  const text = plaintext([
    headline,
    `${args.pickup} → ${args.dropoff}`,
    args.reason ? `Reason: ${args.reason}` : "",
    args.cancellationFeeJmd && args.cancellationFeeJmd > 0
      ? `Cancellation fee: ${JMD(args.cancellationFeeJmd)}`
      : "",
    `Re-hail: ${APP_URL}/rider/request`,
  ]);

  return { subject, html, text };
}

export async function sendRiderHailCancelledEmail(
  to: string,
  args: Parameters<typeof riderHailCancelledTemplate>[0],
) {
  const t = riderHailCancelledTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ── D1. Driver — hail accepted (confirmation of their own tap) ── */

export function driverHailAcceptedTemplate(args: {
  driverName: string;
  hailId: string;
  riderFirstName?: string | null;
  pickup: string;
  dropoff: string;
  fareJMD: number;
}) {
  const first = firstNameOf(args.driverName);
  const riderLabel = args.riderFirstName?.trim() || "your rider";
  const subject = `Hail accepted · ${args.pickup} → ${args.dropoff}`;

  const sections: EmailSection[] = [
    {
      type: "intro",
      text: `Heads up, ${first} — you've claimed a route taxi hail. Pick the rider up at ${args.pickup} on your way through the corridor.`,
    },
    {
      type: "card",
      title: "Hail details",
      rows: [
        { label: "Rider", value: riderLabel },
        { label: "Pickup", value: args.pickup },
        { label: "Dropoff", value: args.dropoff },
        { label: "Fare", value: JMD(args.fareJMD), emphasize: true },
      ],
    },
    {
      type: "highlight",
      tone: "neutral",
      eyebrow: "On pickup",
      text: "Tap 'Picked up' the moment they're onboard so the rider's app reflects the change and the seat counter updates.",
    },
    { type: "cta", href: `${APP_URL}/driver/route-taxi`, label: "Open route session" },
  ];

  const html = renderEmail({
    preheader: `Route taxi hail · ${args.pickup} → ${args.dropoff} · ${JMD(args.fareJMD)}`,
    eyebrow: "Hail accepted",
    title: `${args.pickup} → ${args.dropoff}`,
    sections,
  });

  const text = plaintext([
    `Hi ${first}, you accepted a route taxi hail.`,
    `${args.pickup} → ${args.dropoff} · ${JMD(args.fareJMD)}`,
    `Open session: ${APP_URL}/driver/route-taxi`,
  ]);

  return { subject, html, text };
}

export async function sendDriverHailAcceptedEmail(
  to: string,
  args: Parameters<typeof driverHailAcceptedTemplate>[0],
) {
  const t = driverHailAcceptedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}

/* ── D2. Driver — trip completed (earnings receipt) ── */

export function driverHailCompletedTemplate(args: {
  driverName: string;
  hailId: string;
  pickup: string;
  dropoff: string;
  fareJMD: number;
  driverEarningsJMD: number;
  commissionJMD: number;
  distanceKm?: number | null;
  riderFirstName?: string | null;
  completedAt?: string | Date | null;
}) {
  const first = firstNameOf(args.driverName);
  const subject = `Route taxi earnings · ${JMD(args.driverEarningsJMD)} · ${args.dropoff}`;

  const sections: EmailSection[] = [
    {
      type: "intro",
      text: `Nice work, ${first}. The route taxi trip wrapped — here's your earnings record.`,
    },
    {
      type: "card",
      title: "Earnings",
      rows: [
        { label: "Earned", value: JMD(args.driverEarningsJMD), emphasize: true },
        { label: "From", value: args.pickup },
        { label: "To", value: args.dropoff },
        ...(args.riderFirstName ? [{ label: "Rider", value: args.riderFirstName }] : []),
        ...(args.distanceKm != null
          ? [{ label: "Distance", value: `${args.distanceKm.toFixed(1)} km` }]
          : []),
        ...(args.completedAt
          ? [{ label: "Completed", value: fmtDateTime(args.completedAt) }]
          : []),
        { label: "Gross fare", value: JMD(args.fareJMD) },
        { label: "Rajlo commission", value: `− ${JMD(args.commissionJMD)}` },
      ],
    },
    {
      type: "highlight",
      tone: "positive",
      eyebrow: "Logged",
      text: "This trip is in your earnings dashboard. Payouts run weekly — Friday cut-off, money lands the next business day.",
    },
    { type: "cta", href: `${APP_URL}/driver/earnings`, label: "Open earnings" },
    {
      type: "footnote",
      text: `Need a corrected receipt? Reply with hail ID ${args.hailId}.`,
    },
  ];

  const html = renderEmail({
    preheader: `${JMD(args.driverEarningsJMD)} earned · ${args.pickup} → ${args.dropoff}`,
    eyebrow: "Trip complete",
    title: `${JMD(args.driverEarningsJMD)} earned`,
    sections,
  });

  const text = plaintext([
    `Route taxi done. Earned ${JMD(args.driverEarningsJMD)}.`,
    `${args.pickup} → ${args.dropoff}`,
    `Open earnings: ${APP_URL}/driver/earnings`,
  ]);

  return { subject, html, text };
}

export async function sendDriverHailCompletedEmail(
  to: string,
  args: Parameters<typeof driverHailCompletedTemplate>[0],
) {
  const t = driverHailCompletedTemplate(args);
  return sendEmail({ to, subject: t.subject, html: t.html, text: t.text });
}
