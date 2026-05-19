import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";

/**
 * Public account-deletion page.
 *
 * Exists to satisfy Google Play's Data Safety "data deletion" rule —
 * Play requires a URL, reachable WITHOUT installing or signing into
 * the app, that explains how a user deletes their account and data.
 * This is the URL pasted into Play Console → App content → Data
 * deletion. The actual deletion runs in-app (Settings → Delete
 * account) via /api/account/delete; this page documents it and gives
 * an email fallback for anyone locked out of their account.
 */

export const metadata: Metadata = {
  title: "Delete Your Account — RAJLO",
  description:
    "How to permanently delete your RAJLO rider or driver account and the personal data associated with it.",
  alternates: { canonical: "/account-deletion" },
};

const DELETED = [
  "Your profile — name, phone number, email address, and profile photo",
  "Rider: your ride history, ratings, saved places, and trusted contacts",
  "Driver: your driver record, uploaded Transport Authority documents, ratings, and earnings history",
  "Your wallet balance and transaction history",
  "Your chat threads, voice notes, and image attachments",
  "Push-notification subscriptions on every device you signed in on",
];

const RETAINED = [
  "The other party on a past trip keeps their own record of that trip, with you shown as “Deleted user”.",
  "Admin audit logs of safety, verification, and wallet actions are kept for compliance, as required by Jamaica’s Bank of Jamaica and Transport Authority rules.",
  "Financial records required by Jamaican tax law are retained for the legally mandated period.",
];

export default function AccountDeletionPage() {
  return (
    <MarketingShell>
      <section className="bg-rajlo-black py-14 text-white md:py-20">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rajlo-red">
            RAJLO Account
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            Delete your account
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70">
            You can permanently delete your RAJLO account — rider or
            driver — and the personal data tied to it at any time. This
            page explains how, what is removed, and what is kept.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-10 px-5 py-12">
        {/* In-app steps */}
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Delete from the app
          </h2>
          <ol className="mt-4 space-y-3">
            {[
              "Open the RAJLO app and sign in.",
              "Go to Settings.",
              "Scroll to the “Account” section at the bottom and tap “Delete account”.",
              "Read what will be removed, then tap Continue.",
              "Type DELETE in capital letters to confirm, then tap “Delete my account”.",
            ].map((step, i) => (
              <li
                key={step}
                className="flex gap-3 rounded-2xl border border-line bg-surface p-4 text-sm"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rajlo-red text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Deletion takes effect immediately. You cannot have an active
            trip in progress — finish or cancel it first. Drivers must
            also toggle themselves offline before deleting.
          </p>
        </div>

        {/* Email fallback */}
        <div className="rounded-2xl border border-line bg-surface-soft p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Can’t access your account?
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            If you are locked out and cannot delete from the app, email{" "}
            <a
              href="mailto:support@rajlo.com?subject=Account%20deletion%20request"
              className="font-bold text-rajlo-red hover:underline"
            >
              support@rajlo.com
            </a>{" "}
            from the email address on your account with the subject
            “Account deletion request”. We will verify your identity and
            process the deletion within 30 days.
          </p>
        </div>

        {/* What's deleted */}
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            What gets deleted
          </h2>
          <ul className="mt-4 space-y-2">
            {DELETED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm leading-relaxed"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rajlo-red" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* What's retained */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-900">
            What is kept, and why
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/85">
            A small amount of data is retained after deletion, with your
            identity removed, where the law or platform safety requires
            it:
          </p>
          <ul className="mt-3 space-y-2">
            {RETAINED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm leading-relaxed text-amber-900/85"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-amber-900/75">
            See the{" "}
            <Link
              href="/legal/privacy-policy"
              className="font-bold underline"
            >
              Privacy Policy
            </Link>{" "}
            for the full data-retention schedule.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
