"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/drivers/[externalId] — comprehensive driver hub.
 *
 * The admin's one-stop view of everything about a single driver:
 * personal + vehicle info, documents + expiries, rides + counts,
 * violations, wallet, ratings. A single CTA links out to the
 * moderation-focused /admin/verification-detail surface.
 */

type Doc = {
  docKey: string;
  label: string;
  status: string;
  note: string | null;
  fileName: string | null;
  hasFile: boolean;
  previouslyApproved: boolean;
  expiresOn: string | null;
  renewalPeriodDays: number;
};

type Ride = {
  id: string;
  status: string;
  pickupName: string;
  dropoffName: string;
  seats: number;
  fareJmd: number | null;
  distanceKm: number | null;
  requestedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

type Violation = {
  id: string;
  kind: string;
  details: string | null;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type Response = {
  driver: {
    id: string;
    externalId: string;
    userId: string | null;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    phone: string | null;
    email: string | null;
    trn: string | null;
    nis: string | null;
    licenceNumber: string | null;
    licenceExpiry: string | null;
    badgeNumber: string | null;
    plateNumber: string | null;
    vehicleType: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    vehicleColor: string | null;
    franchiseNumber: string | null;
    franchiseExpiry: string | null;
    onboardingStatus: string;
    activated: boolean;
    deactivatedAt: string | null;
    deactivationReason: string | null;
    adminNote: string | null;
    createdAt: string;
    submittedAt: string | null;
    activatedAt: string | null;
    lastOnlineAt: string | null;
    isOnline: boolean;
  };
  wallet: { balanceJmd: number; updatedAt: string | null } | null;
  docs: Doc[];
  rides: {
    total: number;
    completed: number;
    cancelled: number;
    inFlight: number;
    recent: Ride[];
  };
  violations: {
    total: number;
    open: number;
    recent: Violation[];
  };
  ratings: { count: number; average: number | null };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function AdminDriverHubPage() {
  const params = useParams<{ externalId: string }>();
  const externalId = params.externalId;

  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/drivers/${encodeURIComponent(externalId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Response;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load driver");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-2 py-6 md:px-3 md:py-10">
        <Skeleton className="h-48 w-full" rounded="3xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" rounded="xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" rounded="2xl" />
        <Skeleton className="h-72 w-full" rounded="2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-2 py-16 text-center md:px-3">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
          <span aria-hidden className="text-3xl leading-none">😢</span>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
          Driver not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "We couldn't find that driver."}
        </p>
        <Link
          href="/admin/drivers"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-foreground hover:bg-surface-soft"
        >
          <Icon name="chevron-left" className="h-3.5 w-3.5" />
          Back to drivers
        </Link>
      </div>
    );
  }

  const { driver, wallet, docs, rides, violations, ratings } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-2 py-6 md:px-3 md:py-10">
      <Link
        href="/admin/drivers"
        className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-rajlo-red"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" />
        Drivers
      </Link>

      {/* ─── Hero ─── */}
      <FadeUp>
        <div
          className={`relative overflow-hidden rounded-3xl p-7 text-white shadow-xl md:p-10 ${
            driver.deactivatedAt
              ? "bg-rajlo-red shadow-rajlo-red/30"
              : driver.activated
                ? "bg-emerald-700 shadow-emerald-700/30"
                : "bg-rajlo-black shadow-rajlo-black/30"
          }`}
        >
          <ArcWatermark
            size={460}
            variant={driver.activated ? "white" : "red"}
            className="absolute -right-20 -bottom-20 opacity-[0.14]"
          />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-white/80">
                Driver · {driver.externalId}
              </p>
              <h1 className="mt-2 truncate text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                {driver.fullName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white/15 px-3 py-1 font-extrabold uppercase tracking-wider backdrop-blur">
                  {driver.deactivatedAt
                    ? "Deactivated"
                    : driver.activated
                      ? "Active"
                      : driver.onboardingStatus.replace("_", " ")}
                </span>
                {driver.isOnline && driver.activated && (
                  <span className="rounded-full bg-emerald-500 px-3 py-1 font-extrabold uppercase tracking-wider">
                    Online
                  </span>
                )}
                {driver.plateNumber && (
                  <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/85 backdrop-blur">
                    Plate {driver.plateNumber}
                  </span>
                )}
                {ratings.average !== null && (
                  <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-white/85 backdrop-blur">
                    ★ {ratings.average.toFixed(2)} · {ratings.count} rating
                    {ratings.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/admin/verification-detail?driverId=${encodeURIComponent(driver.externalId)}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-rajlo-black transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Icon name="clipboard-check" className="h-4 w-4" />
              Open verification review
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </FadeUp>

      {/* ─── KPI strip ─── */}
      <FadeUp delay={0.04}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Rides completed"
            value={rides.completed.toLocaleString("en-JM")}
            tone="emerald"
          />
          <KpiTile
            label="Cancellations"
            value={rides.cancelled.toLocaleString("en-JM")}
            tone={rides.cancelled > 0 ? "danger" : undefined}
          />
          <KpiTile
            label="Open violations"
            value={violations.open.toLocaleString("en-JM")}
            tone={violations.open > 0 ? "danger" : undefined}
          />
          <KpiTile
            label="Wallet balance"
            value={wallet ? formatJMD(wallet.balanceJmd) : "—"}
          />
        </div>
      </FadeUp>

      {/* ─── Personal / identity + vehicle ─── */}
      <FadeUp delay={0.06}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InfoCard title="Personal & identity">
            <DetailRow label="Full name" value={driver.fullName} />
            <DetailRow label="Phone" value={driver.phone ?? "—"} />
            <DetailRow label="Email" value={driver.email ?? "—"} />
            <DetailRow label="TRN" value={driver.trn ?? "—"} />
            <DetailRow label="NIS" value={driver.nis ?? "—"} />
            <DetailRow
              label="Driver's licence"
              value={driver.licenceNumber ?? "—"}
              detail={
                driver.licenceExpiry && ISO_DATE.test(driver.licenceExpiry)
                  ? `Expires ${formatIsoDate(driver.licenceExpiry)}`
                  : undefined
              }
            />
            <DetailRow label="TA badge" value={driver.badgeNumber ?? "—"} />
          </InfoCard>

          <InfoCard title="Vehicle">
            <DetailRow label="Plate" value={driver.plateNumber ?? "—"} />
            <DetailRow
              label="Vehicle"
              value={
                driver.vehicleMake && driver.vehicleModel
                  ? `${driver.vehicleYear ?? ""} ${driver.vehicleMake} ${driver.vehicleModel}`.trim()
                  : "—"
              }
            />
            <DetailRow label="Colour" value={driver.vehicleColor ?? "—"} />
            <DetailRow label="Type" value={driver.vehicleType ?? "—"} />
            <DetailRow
              label="TA franchise"
              value={driver.franchiseNumber ?? "—"}
              detail={
                driver.franchiseExpiry &&
                ISO_DATE.test(driver.franchiseExpiry)
                  ? `Expires ${formatIsoDate(driver.franchiseExpiry)}`
                  : undefined
              }
            />
            <DetailRow
              label="Joined"
              value={formatIsoDateTime(driver.createdAt)}
            />
            {driver.activatedAt && (
              <DetailRow
                label="Activated"
                value={formatIsoDateTime(driver.activatedAt)}
              />
            )}
          </InfoCard>
        </div>
      </FadeUp>

      {/* ─── Documents ─── */}
      <FadeUp delay={0.08}>
        <InfoCard
          title={`Documents (${docs.length})`}
          action={
            <Link
              href={`/admin/verification-detail?driverId=${encodeURIComponent(driver.externalId)}`}
              className="text-xs font-bold text-rajlo-red hover:underline"
            >
              Manage in verification →
            </Link>
          }
        >
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d.docKey}
                className="flex items-center gap-3 rounded-lg bg-surface-soft px-3 py-2.5"
              >
                <DocStatusIcon status={d.status} />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-sm font-semibold">{d.label}</p>
                  <p className="truncate text-[11px] text-muted">
                    {docStatusLabel(d.status)}
                    {d.expiresOn && ISO_DATE.test(d.expiresOn)
                      ? ` · Expires ${formatIsoDate(d.expiresOn)}`
                      : ""}
                    {d.previouslyApproved && d.status === "pending"
                      ? " · Re-uploaded"
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </InfoCard>
      </FadeUp>

      {/* ─── Deactivation banner ─── */}
      {driver.deactivatedAt && (
        <FadeUp delay={0.09}>
          <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft p-4">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Deactivated {formatIsoDateTime(driver.deactivatedAt)}
            </p>
            {driver.deactivationReason && (
              <p className="mt-1 text-sm font-semibold">
                {driver.deactivationReason}
              </p>
            )}
          </div>
        </FadeUp>
      )}

      {/* ─── Recent rides ─── */}
      <FadeUp delay={0.1}>
        <InfoCard
          title={`Recent rides (${rides.recent.length} of ${rides.total.toLocaleString("en-JM")})`}
        >
          {rides.recent.length === 0 ? (
            <p className="rounded-lg bg-surface-soft py-8 text-center text-xs text-muted">
              No rides yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {rides.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/rides/${r.id}`}
                    className="block px-1 py-3 transition-colors hover:bg-surface-soft"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">
                        {r.pickupName} → {r.dropoffName}
                      </p>
                      <span className="shrink-0 text-xs font-extrabold text-rajlo-red">
                        {r.fareJmd !== null ? formatJMD(r.fareJmd) : "—"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      <span className="font-bold uppercase tracking-wider">
                        {r.status.replace("_", " ")}
                      </span>
                      {" · "}
                      {formatIsoDateTime(r.requestedAt)}
                      {r.distanceKm !== null ? ` · ${r.distanceKm} km` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </InfoCard>
      </FadeUp>

      {/* ─── Violations ─── */}
      <FadeUp delay={0.12}>
        <InfoCard
          title={`Warnings & violations (${violations.total.toLocaleString("en-JM")})`}
          action={
            violations.total > 0 ? (
              <Link
                href={`/admin/violations?driverId=${encodeURIComponent(driver.id)}`}
                className="text-xs font-bold text-rajlo-red hover:underline"
              >
                All violations →
              </Link>
            ) : undefined
          }
        >
          {violations.recent.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 py-8 text-center text-xs font-semibold text-emerald-700">
              Clean record — no violations on file.
            </p>
          ) : (
            <ul className="space-y-2">
              {violations.recent.map((v) => (
                <li
                  key={v.id}
                  className={`rounded-lg border px-3 py-2.5 ${
                    v.resolvedAt
                      ? "border-line bg-surface-soft"
                      : "border-rajlo-red/30 bg-primary-soft"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">
                      {v.kind.replace(/_/g, " ")}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        v.resolvedAt
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rajlo-red text-white"
                      }`}
                    >
                      {v.resolvedAt ? "Resolved" : "Open"}
                    </span>
                  </div>
                  {v.details && (
                    <p className="mt-1 text-xs text-muted">{v.details}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted">
                    {formatIsoDateTime(v.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InfoCard>
      </FadeUp>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "danger";
}) {
  const valueClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-rajlo-red"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg bg-surface-soft px-3 py-2">
      <span className="mt-0.5 text-xs font-medium text-muted">{label}</span>
      <div className="min-w-0 text-right">
        <p className="truncate text-sm font-semibold">{value}</p>
        {detail && (
          <p className="mt-0.5 text-[11px] font-medium text-muted">{detail}</p>
        )}
      </div>
    </div>
  );
}

function DocStatusIcon({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-white">
        <Icon name="check-circle" className="h-4 w-4" />
      </span>
    );
  if (status === "rejected")
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rajlo-red text-white">
        <Icon name="alert-triangle" className="h-4 w-4" />
      </span>
    );
  if (status === "pending")
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
        <Icon name="clock" className="h-4 w-4" />
      </span>
    );
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-soft text-muted">
      <Icon name="upload" className="h-4 w-4" />
    </span>
  );
}

function docStatusLabel(status: string): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "pending") return "Pending review";
  return "Not uploaded";
}

function formatIsoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-JM", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatIsoDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-JM", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
