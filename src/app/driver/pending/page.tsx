import { redirect } from "next/navigation";
import Link from "next/link";
import { getDriverStatus } from "@/lib/driver-status";
import { Logo } from "@/components/logo";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import { NativeUnverifiedRedirect } from "@/components/native-unverified-redirect";

export default async function DriverPendingPage() {
  const status = await getDriverStatus();

  if (status.state === "unauthenticated") redirect("/auth/driver/login");
  if (status.state === "not_a_driver") redirect("/");
  if (status.state === "needs_onboarding") redirect("/driver/onboarding");
  if (status.state === "active") redirect("/driver");

  // status.state is now 'pending_verification', 'rejected', or 'deactivated'
  const isRejected = status.state === "rejected";
  const isDeactivated = status.state === "deactivated";
  const driver = status.driver;

  // Prefer the latest submission timestamp so resubmissions reset the clock.
  // Falls back to created_at for older rows that pre-date the submitted_at
  // column being populated.
  const submittedAt = new Date(driver.submitted_at ?? driver.created_at);
  const formattedSubmitted = submittedAt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // This is a server component (runs once per request). `Date.now()`
  // here is request-time, not render-time — the React 19 purity rule
  // assumes a client render context that can re-execute, which isn't
  // applicable for an async server component. Captured into a const
  // so the rest of the math reads from a single value, and the
  // eslint disable below is scoped to this one intentional call.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const minutesSince = Math.max(
    0,
    Math.floor((nowMs - submittedAt.getTime()) / (1000 * 60)),
  );
  const hoursSince = Math.floor(minutesSince / 60);
  const daysSince = Math.floor(hoursSince / 24);
  const isOverdue = hoursSince > 48; // 2 business days

  // Show minutes only if under an hour, hours only if under a day, then days.
  let relativeSubmitted: string;
  if (minutesSince < 60) {
    relativeSubmitted = `${minutesSince} min${minutesSince === 1 ? "" : "s"} ago`;
  } else if (hoursSince < 24) {
    relativeSubmitted = `${hoursSince} hr${hoursSince === 1 ? "" : "s"} ago`;
  } else {
    relativeSubmitted = `${daysSince} day${daysSince === 1 ? "" : "s"} ago`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-soft">
      {/* Native unverified → kick to the verify-on-web screen. No-op on web. */}
      <NativeUnverifiedRedirect />
      {/* ────── Top bar ────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-2 py-3 md:px-3 md:py-4">
          <Logo size="sm" tagline />
          <SignOutButton />
        </div>
      </header>

      {/* ────── Body ────── */}
      <div className="relative mx-auto w-full max-w-3xl flex-1 px-2 py-10 md:px-3 md:py-16">
        {/* ─── Status hero ─── */}
        <div
          className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-xl md:p-10 ${
            isDeactivated
              ? "bg-rajlo-black shadow-black/30"
              : "bg-rajlo-red shadow-rajlo-red/20"
          }`}
        >
          <ArcWatermark
            size={420}
            variant="white"
            className="absolute -right-20 -bottom-20 opacity-[0.10]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/85">
              {isDeactivated
                ? "Account deactivated"
                : isRejected
                  ? "Action required"
                  : "Application status"}
            </p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
              {isDeactivated
                ? "Your account is currently deactivated"
                : isRejected
                  ? "We need a few changes"
                  : "Verification in progress"}
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/90 md:text-lg">
              {isDeactivated
                ? "Our operations team has paused your driver account. You won't be able to accept ride requests until your application is re-verified. If you think this is a mistake, please contact support and we'll sort it out."
                : isRejected
                  ? "Some of your documents need attention before we can activate your account. Check the notes below and resubmit."
                  : "Your application is with our operations team. We're reviewing every document against Jamaica Transport Authority records."}
            </p>

            {!isRejected && !isDeactivated && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Live: documents under review
              </div>
            )}
          </div>
        </div>

        {/* ─── Deactivation reason + contact CTA ─── */}
        {isDeactivated && (
          <div className="relative mt-5 overflow-hidden rounded-2xl border border-rajlo-red/30 bg-primary-soft p-7">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  {driver.admin_note ? "Reason from operations" : "What happens next"}
                </p>
                <p className="mt-2 text-base leading-relaxed text-rajlo-black">
                  {driver.admin_note
                    ? driver.admin_note
                    : "Our team is reviewing your account. You'll receive an email when the review is complete."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg"
                  >
                    <Icon name="mail" className="h-4 w-4" />
                    Contact support
                  </Link>
                  <Link
                    href="/help"
                    className="inline-flex items-center gap-1.5 rounded-full border border-rajlo-red/30 bg-white px-5 py-2.5 text-sm font-bold text-rajlo-red hover:bg-primary-soft"
                  >
                    Help Center
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Resubmission CTA (rejected only) ─── */}
        {isRejected && (
          <div className="relative mt-5 overflow-hidden rounded-2xl border border-rajlo-red/30 bg-primary-soft p-7">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rajlo-red text-white">
                <Icon name="alert-triangle" className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  {driver.admin_note ? "Note from operations" : "Resubmission required"}
                </p>
                <p className="mt-2 text-base leading-relaxed text-rajlo-black">
                  {driver.admin_note
                    ? driver.admin_note
                    : "One or more of your documents needs to be re-uploaded. Open your application to see exactly which documents are flagged — your form fields and approved files are still saved."}
                </p>
                <Link
                  href="/driver/resubmit"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rajlo-red/20 transition-all hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg"
                >
                  Resubmit documents
                  <Icon name="arrow-right" className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ─── Submitted timestamp + processing time (pending only) ─── */}
        {!isRejected && !isDeactivated && (
          <div className="relative mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
                  <Icon name="clock" className="h-4 w-4" />
                </span>
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Estimated processing time
                </p>
              </div>
              <p className="mt-3 text-2xl font-extrabold tracking-tight">1–2 business days</p>
              <p className="mt-1 text-sm text-muted">
                Most applications are approved within 48 hours of submission. Allow up to
                3 business days during high-volume periods.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-rajlo-red">
                  <Icon name="check-circle" className="h-4 w-4" />
                </span>
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Submitted
                </p>
              </div>
              <p className="mt-3 text-2xl font-extrabold tracking-tight">
                {relativeSubmitted}
              </p>
              <p className="mt-1 text-sm text-muted">{formattedSubmitted}</p>
            </div>
          </div>
        )}

        {/* ─── What happens next (pending only) ─── */}
        {!isRejected && !isDeactivated && (
          <div className="relative mt-5 rounded-2xl border border-line bg-surface p-7">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              What happens next
            </p>
            <ol className="mt-4 space-y-4">
              {[
                {
                  title: "We review every document",
                  body: "Each TA document is checked against current Transport Authority records — franchise, badge, COF, insurance, and supporting IDs.",
                },
                {
                  title: "Cross-checks against TA records",
                  body: "Your franchise certificate and red plate are matched against TA's public registry to confirm they're current and route-valid.",
                },
                {
                  title: "You'll get an email + SMS",
                  body: "As soon as you're approved, we'll notify you and your account will activate automatically. No further action needed from you.",
                },
              ].map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rajlo-red text-xs font-extrabold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{s.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ─── Taking longer than expected ─── */}
        {isOverdue && !isRejected && (
          <div className="relative mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
                <Icon name="clock" className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">
                  Taking longer than expected?
                </p>
                <p className="mt-1 text-sm leading-relaxed text-amber-900/80">
                  Your application has been pending for over 48 hours. If you haven&apos;t heard back, our team can give you a status update.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Contact support — already covered by the deactivation hero,
             so we hide the bottom card to avoid the same "Contact support"
             button appearing twice. ─── */}
        {!isDeactivated && (
          <div className="relative mt-5 grid gap-4 rounded-2xl border border-line bg-surface p-7 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Need a hand?
              </p>
              <h3 className="mt-2 text-xl font-extrabold tracking-tight">
                Talk to a human.
              </h3>
              <p className="mt-2 text-sm text-muted">
                If your application has been pending unusually long, or you spotted a
                mistake in your submission, our support team can help.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-rajlo-black px-6 py-3 text-sm font-bold text-white hover:bg-black"
              >
                Contact support
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <Link
                href="/help"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 py-3 text-sm font-bold text-foreground hover:bg-surface-soft"
              >
                Help Center
              </Link>
            </div>
          </div>
        )}

        {/* ─── Refresh hint ─── */}
        {!isDeactivated && (
          <p className="relative mt-6 text-center text-xs text-muted">
            We&apos;ll email and text you the moment your account activates. Want to check
            right now?{" "}
            {/* Intentional plain <a>: this is a server component, and
                we WANT a full reload so the server re-fetches the
                driver status. A <Link> to the same URL is a client
                no-op and wouldn't refresh anything. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/driver/pending"
              className="font-semibold text-rajlo-red hover:underline"
            >
              Refresh status
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
