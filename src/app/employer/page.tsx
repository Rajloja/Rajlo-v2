"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";

/**
 * Employer dashboard. Two zones:
 *
 *   1. Four-tile stat strip — Total / Pending / Approved / Rejected.
 *      Each tile is a filter on the driver list below.
 *   2. Driver list — the drivers THIS employer has onboarded. Newest
 *      first. Each row is tappable to the driver-detail page (shows
 *      current verification status + any rejection notes so the
 *      employer can act on the ones they can act on).
 *
 * Data comes from /api/employer/drivers?filter=... — service-role
 * scoped to `onboarded_by_employer_id = auth.uid()`.
 */

type StatusFilter = "all" | "pending" | "approved" | "rejected";

type DriverRow = {
  driverId: string;
  externalId: string;
  fullName: string;
  email: string;
  onboardingStatus:
    | "draft"
    | "pending_review"
    | "approved"
    | "rejected"
    | "deactivated";
  activated: boolean;
  submittedAt: string | null;
  adminNote: string | null;
};

type Stats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

const STATUS_LABEL: Record<DriverRow["onboardingStatus"], string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  deactivated: "Deactivated",
};

const STATUS_TONE: Record<DriverRow["onboardingStatus"], string> = {
  draft: "bg-surface-soft text-muted",
  pending_review: "bg-amber-50 text-amber-800 border border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected: "bg-rajlo-red/10 text-rajlo-red border border-rajlo-red/30",
  deactivated: "bg-surface-soft text-muted border border-line",
};

export default function EmployerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [statsRes, listRes] = await Promise.all([
          fetch("/api/employer/stats"),
          fetch(`/api/employer/drivers?filter=${filter}`),
        ]);
        if (cancelled) return;
        if (!statsRes.ok || !listRes.ok) {
          throw new Error("Couldn't load dashboard");
        }
        const statsJson = (await statsRes.json()) as { stats: Stats };
        const listJson = (await listRes.json()) as { drivers: DriverRow[] };
        setStats(statsJson.stats);
        setDrivers(listJson.drivers);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load dashboard");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const loading = drivers === null || stats === null;

  return (
    <div className="space-y-6">
      {/* Hero — quick context + primary CTA */}
      <FadeUp>
        <section className="rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Employer portal
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            Onboard a driver in minutes.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/70 md:text-base">
            Sit with a driver at the taxi hub, capture their credentials
            + documents, and submit for admin approval. Rajlo emails them
            a link to set their own password — you never see it.
          </p>
          <Link
            href="/employer/onboard"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            <Icon name="users" className="h-4 w-4" />
            Start a new onboarding
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </section>
      </FadeUp>

      {/* Stat tiles / filters */}
      <FadeUp delay={0.05}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Onboarded"
            value={stats?.total ?? null}
            filter="all"
            active={filter === "all"}
            onSelect={setFilter}
            icon="users"
            tone="neutral"
          />
          <StatTile
            label="Pending review"
            value={stats?.pending ?? null}
            filter="pending"
            active={filter === "pending"}
            onSelect={setFilter}
            icon="clock"
            tone="amber"
          />
          <StatTile
            label="Approved"
            value={stats?.approved ?? null}
            filter="approved"
            active={filter === "approved"}
            onSelect={setFilter}
            icon="check-circle"
            tone="emerald"
          />
          <StatTile
            label="Rejected"
            value={stats?.rejected ?? null}
            filter="rejected"
            active={filter === "rejected"}
            onSelect={setFilter}
            icon="alert-triangle"
            tone="red"
          />
        </div>
      </FadeUp>

      {/* Driver list */}
      <FadeUp delay={0.1}>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-tight">
              {filter === "all"
                ? "All drivers"
                : filter === "pending"
                  ? "Pending drivers"
                  : filter === "approved"
                    ? "Approved drivers"
                    : "Rejected drivers"}
            </h2>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" rounded="lg" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <EmptyState
              title={
                filter === "all"
                  ? "No drivers yet"
                  : `No ${filter} drivers`
              }
              body={
                filter === "all"
                  ? "Start your first onboarding — it takes about 5 minutes at the hub."
                  : "This bucket is empty for now."
              }
              cta={
                filter === "all"
                  ? { label: "Start onboarding", href: "/employer/onboard" }
                  : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {drivers.map((d) => (
                <li key={d.driverId}>
                  <Link
                    href={`/employer/drivers/${d.externalId}`}
                    className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">
                        {d.fullName || "Unnamed driver"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {d.email} · {d.externalId}
                      </p>
                      {d.adminNote && (
                        <p className="mt-1 truncate text-xs text-rajlo-red">
                          Admin note: {d.adminNote}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_TONE[d.onboardingStatus]}`}
                      >
                        {STATUS_LABEL[d.onboardingStatus]}
                      </span>
                      <Icon
                        name="chevron-right"
                        className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </FadeUp>
    </div>
  );
}

function StatTile({
  label,
  value,
  filter,
  active,
  onSelect,
  icon,
  tone,
}: {
  label: string;
  value: number | null;
  filter: StatusFilter;
  active: boolean;
  onSelect: (f: StatusFilter) => void;
  icon: "users" | "clock" | "check-circle" | "alert-triangle";
  tone: "neutral" | "amber" | "emerald" | "red";
}) {
  const toneClasses = {
    neutral: "bg-surface-soft text-foreground",
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-rajlo-red/10 text-rajlo-red",
  }[tone];
  return (
    <button
      type="button"
      onClick={() => onSelect(filter)}
      className={`flex flex-col rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? "border-rajlo-red bg-primary-soft/50 shadow-md"
          : "border-line bg-surface"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl ${toneClasses}`}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums">
        {value === null ? (
          <Skeleton className="h-7 w-10" rounded="md" />
        ) : (
          value.toLocaleString("en-JM")
        )}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-muted">{label}</p>
    </button>
  );
}
