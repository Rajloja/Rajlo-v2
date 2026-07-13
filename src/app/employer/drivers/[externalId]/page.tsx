"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";

/**
 * /employer/drivers/[externalId]
 *
 * Read-only detail view of a driver THIS employer onboarded. Shows:
 *   - Current onboarding status (with the admin's note if rejected)
 *   - Contact info + vehicle
 *   - Per-doc verification status
 *   - Password-setup progress ("driver hasn't set their password yet"
 *     is a real actionable signal — the employer can ping them)
 *
 * Employers can't EDIT after submission — that's admin's job. If a
 * doc gets rejected, the driver resubmits it themselves from
 * /driver/resubmit once they've set their password.
 */

type DriverDetail = {
  externalId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  plateNumber: string | null;
  vehicle: string | null;
  onboardingStatus:
    | "draft"
    | "pending_review"
    | "approved"
    | "rejected"
    | "deactivated";
  activated: boolean;
  submittedAt: string | null;
  adminNote: string | null;
  passwordSetupStatus: "pending" | "completed" | "superseded" | "no_token";
};

type DocRow = {
  docKey: string;
  label: string;
  status:
    | "approved"
    | "pending"
    | "rejected"
    | "missing"
    | "expiring_soon"
    | "expired";
  note: string | null;
};

const STATUS_LABEL: Record<DriverDetail["onboardingStatus"], string> = {
  draft: "Draft",
  pending_review: "Pending admin review",
  approved: "Approved",
  rejected: "Rejected",
  deactivated: "Deactivated",
};

const STATUS_TONE: Record<DriverDetail["onboardingStatus"], string> = {
  draft: "bg-surface-soft text-muted",
  pending_review: "bg-amber-50 text-amber-800 border border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected: "bg-rajlo-red/10 text-rajlo-red border border-rajlo-red/30",
  deactivated: "bg-surface-soft text-muted border border-line",
};

const DOC_TONE: Record<DocRow["status"], string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-800",
  rejected: "bg-rajlo-red/10 text-rajlo-red",
  missing: "bg-surface-soft text-muted",
  expiring_soon: "bg-amber-50 text-amber-800",
  expired: "bg-rajlo-red/10 text-rajlo-red",
};

export default function EmployerDriverDetailPage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  const { externalId } = use(params);
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/employer/drivers/${encodeURIComponent(externalId)}`,
        );
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "This driver either doesn't exist or was onboarded by someone else."
              : "Couldn't load driver.",
          );
        }
        const json = (await res.json()) as {
          driver: DriverDetail;
          docs: DocRow[];
        };
        if (cancelled) return;
        setDriver(json.driver);
        setDocs(json.docs);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load driver.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalId]);

  return (
    <div className="space-y-6">
      <Link
        href="/employer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground"
      >
        <Icon name="chevron-left" className="h-4 w-4" />
        Back to dashboard
      </Link>

      {error && (
        <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </div>
      )}

      {driver ? (
        <>
          <FadeUp>
            <section className="rounded-3xl border border-line bg-surface p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    Driver
                  </p>
                  <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight md:text-3xl">
                    {driver.fullName || "Unnamed driver"}
                  </h1>
                  <p className="mt-0.5 text-sm text-muted">
                    {driver.externalId}
                    {driver.plateNumber ? ` · ${driver.plateNumber}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${STATUS_TONE[driver.onboardingStatus]}`}
                >
                  {STATUS_LABEL[driver.onboardingStatus]}
                </span>
              </div>

              {driver.adminNote && (
                <div className="mt-5 rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
                    Admin note
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">
                    {driver.adminNote}
                  </p>
                </div>
              )}

              <div className="mt-5 grid gap-2 rounded-2xl border border-line bg-surface-soft p-3">
                <Row label="Email" value={driver.email ?? "—"} />
                <Row label="Phone" value={driver.phone ?? "—"} />
                <Row label="Vehicle" value={driver.vehicle ?? "—"} />
                <Row
                  label="Submitted"
                  value={
                    driver.submittedAt
                      ? new Date(driver.submittedAt).toLocaleDateString(
                          "en-JM",
                          {
                            timeZone: "America/Jamaica",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )
                      : "—"
                  }
                />
              </div>
            </section>
          </FadeUp>

          <FadeUp delay={0.05}>
            <section className="rounded-3xl border border-line bg-surface p-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
                Password setup
              </h2>
              <PasswordSetupStatus status={driver.passwordSetupStatus} />
            </section>
          </FadeUp>

          <FadeUp delay={0.1}>
            <section className="rounded-3xl border border-line bg-surface p-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
                Documents
              </h2>
              {docs === null ? (
                <div className="mt-4 space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" rounded="lg" />
                  ))}
                </div>
              ) : docs.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No documents on file.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {docs.map((d) => (
                    <li
                      key={d.docKey}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line bg-surface-soft p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{d.label}</p>
                        {d.note && (
                          <p className="mt-0.5 text-xs text-muted">{d.note}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${DOC_TONE[d.status]}`}
                      >
                        {d.status.replace("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </FadeUp>
        </>
      ) : !error ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" rounded="lg" />
          <Skeleton className="h-24 w-full" rounded="lg" />
          <Skeleton className="h-40 w-full" rounded="lg" />
        </div>
      ) : null}
    </div>
  );
}

function PasswordSetupStatus({
  status,
}: {
  status: DriverDetail["passwordSetupStatus"];
}) {
  const map: Record<
    DriverDetail["passwordSetupStatus"],
    { icon: "check-circle" | "clock" | "alert-triangle"; tone: string; text: string }
  > = {
    completed: {
      icon: "check-circle",
      tone: "text-emerald-700",
      text: "Driver has set their password and can sign in.",
    },
    pending: {
      icon: "clock",
      tone: "text-amber-800",
      text: "Driver still needs to click the setup link we emailed them.",
    },
    superseded: {
      icon: "alert-triangle",
      tone: "text-amber-800",
      text: "An admin regenerated the link — the driver has a fresh email.",
    },
    no_token: {
      icon: "alert-triangle",
      tone: "text-rajlo-red",
      text: "No setup token found — ask an admin to regenerate one.",
    },
  };
  const item = map[status];
  return (
    <p
      className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold ${item.tone}`}
    >
      <Icon name={item.icon} className="h-4 w-4" />
      {item.text}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface px-3 py-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
