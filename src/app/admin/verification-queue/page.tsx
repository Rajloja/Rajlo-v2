"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp, Stagger, StaggerItem } from "@/components/anim";
import { TableSkeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";

type Driver = {
  id: string;
  externalId: string;
  name: string;
  plateNumber: string | null;
  status: "pending_review" | "rejected" | "active" | string;
  activated?: boolean;
  submittedAt: string;
  adminNote: string | null;
  docsUploaded: number;
  docsPending: number;
  docsRejected: number;
};

type QueueResponse = { drivers: Driver[]; pagination?: { hasMore: boolean } };

const PAGE_SIZE = 50;

type Filter = "all" | "pending" | "rejected" | "active";

// Source of truth for the doc count display; matches mock-data.requiredTADocuments
const TOTAL_REQUIRED_DOCS = 9;

export default function VerificationQueuePage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Two parallel live queries — pipeline (pending/rejected) and active.
  // Both fetch the FIRST page (PAGE_SIZE rows) and refresh every 20s so
  // newly-submitted onboardings + admin-side status changes appear
  // without a manual reload. Additional pages come via `loadMore` and
  // are appended to `extraPipeline` / `extraActive` — polling on the
  // first page still auto-refreshes without wiping the extra pages.
  const pipelineQuery = useLiveQuery<QueueResponse>(
    `/api/admin/verification-queue?limit=${PAGE_SIZE}&offset=0`,
    { interval: 20_000 },
  );
  const activeQuery = useLiveQuery<QueueResponse>(
    `/api/admin/verification-queue?scope=active&limit=${PAGE_SIZE}&offset=0`,
    { interval: 20_000 },
  );
  const [extraPipeline, setExtraPipeline] = useState<Driver[]>([]);
  const [extraActive, setExtraActive] = useState<Driver[]>([]);
  const [pipelineHasMore, setPipelineHasMore] = useState<boolean | null>(null);
  const [activeHasMore, setActiveHasMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Reset the appended pages whenever the first-page query re-runs a
  // fresh fetch (component remount / manual refresh). Without this,
  // stale extra pages would linger on top of a refreshed first page.
  useEffect(() => {
    setExtraPipeline([]);
    setPipelineHasMore(
      pipelineQuery.data?.pagination?.hasMore ?? null,
    );
  }, [pipelineQuery.data?.drivers]);
  useEffect(() => {
    setExtraActive([]);
    setActiveHasMore(activeQuery.data?.pagination?.hasMore ?? null);
  }, [activeQuery.data?.drivers]);

  // Stable derived array. Without useMemo every render produces a
  // fresh `drivers` reference, churning downstream memos.
  const drivers = useMemo(
    () => [
      ...(pipelineQuery.data?.drivers ?? []),
      ...extraPipeline,
      ...(activeQuery.data?.drivers ?? []),
      ...extraActive,
    ],
    [
      pipelineQuery.data?.drivers,
      activeQuery.data?.drivers,
      extraPipeline,
      extraActive,
    ],
  );

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const canPipeline = pipelineHasMore === true;
      const canActive = activeHasMore === true;
      const fetches: Promise<void>[] = [];
      if (canPipeline) {
        const offset =
          (pipelineQuery.data?.drivers.length ?? 0) + extraPipeline.length;
        fetches.push(
          fetch(
            `/api/admin/verification-queue?limit=${PAGE_SIZE}&offset=${offset}`,
          )
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json() as Promise<QueueResponse>;
            })
            .then((json) => {
              setExtraPipeline((prev) => {
                const seen = new Set([
                  ...(pipelineQuery.data?.drivers ?? []).map((d) => d.id),
                  ...prev.map((d) => d.id),
                ]);
                return [
                  ...prev,
                  ...json.drivers.filter((d) => !seen.has(d.id)),
                ];
              });
              setPipelineHasMore(json.pagination?.hasMore ?? false);
            }),
        );
      }
      if (canActive) {
        const offset =
          (activeQuery.data?.drivers.length ?? 0) + extraActive.length;
        fetches.push(
          fetch(
            `/api/admin/verification-queue?scope=active&limit=${PAGE_SIZE}&offset=${offset}`,
          )
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json() as Promise<QueueResponse>;
            })
            .then((json) => {
              setExtraActive((prev) => {
                const seen = new Set([
                  ...(activeQuery.data?.drivers ?? []).map((d) => d.id),
                  ...prev.map((d) => d.id),
                ]);
                return [
                  ...prev,
                  ...json.drivers.filter((d) => !seen.has(d.id)),
                ];
              });
              setActiveHasMore(json.pagination?.hasMore ?? false);
            }),
        );
      }
      await Promise.all(fetches);
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const canLoadMore = pipelineHasMore === true || activeHasMore === true;
  const loading = pipelineQuery.loading || activeQuery.loading;
  const error = pipelineQuery.error;
  const newestUpdate = [
    pipelineQuery.lastUpdated,
    activeQuery.lastUpdated,
  ].reduce<Date | null>(
    (acc, d) => (d && (!acc || d > acc) ? d : acc),
    null,
  );
  const refreshAll = () => {
    pipelineQuery.refresh();
    activeQuery.refresh();
  };

  const filtered = useMemo(() => {
    let list = drivers;
    if (filter === "all") {
      // "All" = everything in the verification pipeline (excludes active).
      list = list.filter((d) => d.status !== "active");
    } else if (filter === "pending") {
      list = list.filter((d) => d.status === "pending_review");
    } else if (filter === "rejected") {
      list = list.filter((d) => d.status === "rejected");
    } else if (filter === "active") {
      list = list.filter((d) => d.status === "active");
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.externalId.toLowerCase().includes(q) ||
          (d.plateNumber ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [drivers, filter, search]);

  const counts = useMemo(() => {
    const inPipeline = drivers.filter((d) => d.status !== "active").length;
    const pending = drivers.filter((d) => d.status === "pending_review").length;
    const rejected = drivers.filter((d) => d.status === "rejected").length;
    const active = drivers.filter((d) => d.status === "active").length;
    return { all: inPipeline, pending, rejected, active };
  }, [drivers]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-3 py-6 md:px-4 md:py-8">
      {/* ─── Hero ─── */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-10">
          <ArcWatermark size={420} variant="red" className="absolute -right-20 -bottom-20 opacity-[0.10]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Operations
                </p>
                <LiveIndicator
                  variant="dark"
                  lastUpdated={newestUpdate}
                  refreshing={pipelineQuery.refreshing || activeQuery.refreshing}
                  onRefresh={refreshAll}
                />
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                Verification queue
              </h1>
              <p className="mt-1 text-sm text-white/70 md:text-base">
                Drivers awaiting TA document review, sorted by submission time.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Total
                </p>
                <p className="mt-0.5 text-3xl font-extrabold tracking-tight">{counts.all}</p>
              </div>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* ─── Filter chips + search ─── */}
      <FadeUp delay={0.05}>
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="All"
              count={counts.all}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterChip
              label="Pending review"
              count={counts.pending}
              active={filter === "pending"}
              onClick={() => setFilter("pending")}
              tone="amber"
            />
            <FilterChip
              label="Resubmit"
              count={counts.rejected}
              active={filter === "rejected"}
              onClick={() => setFilter("rejected")}
              tone="red"
            />
            <FilterChip
              label="Active drivers"
              count={counts.active}
              active={filter === "active"}
              onClick={() => setFilter("active")}
              tone="emerald"
            />
          </div>

          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted [&>svg]:h-4 [&>svg]:w-4"
            >
              <Icon name="search" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, plate, or ID…"
              className="w-full min-w-0 rounded-xl border border-line bg-surface-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15 sm:w-72"
            />
          </div>
        </div>
      </FadeUp>

      {/* ─── List / states ─── */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft p-6 text-center">
          <span aria-hidden className="block text-4xl leading-none">😢</span>
          <p className="mt-3 text-sm font-bold text-rajlo-red">{error}</p>
          <p className="mt-1 text-xs text-muted">
            Refresh the page or check your sign-in.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-line bg-surface p-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Icon name="check-circle" className="h-7 w-7" />
          </span>
          <p className="mt-5 text-xl font-extrabold tracking-tight">All caught up</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {drivers.length === 0
              ? "No drivers awaiting verification right now. New submissions will appear here automatically."
              : "No drivers match your filter. Adjust the filter or search to see more."}
          </p>
        </div>
      ) : (
        <>
          <Stagger className="space-y-3" amount={0.05}>
            {filtered.map((d) => (
              <StaggerItem key={d.id}>
                <DriverCard driver={d} />
              </StaggerItem>
            ))}
          </Stagger>
          {(canLoadMore || loadMoreError) && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {loadMoreError && (
                <p className="text-xs font-semibold text-rajlo-red">
                  {loadMoreError}
                </p>
              )}
              {canLoadMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore && (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                  )}
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "amber" | "red" | "emerald";
}) {
  const toneActive =
    tone === "red"
      ? "bg-rajlo-red text-white shadow-sm"
      : tone === "amber"
        ? "bg-amber-500 text-white shadow-sm"
        : tone === "emerald"
          ? "bg-emerald-600 text-white shadow-sm"
          : "bg-rajlo-black text-white shadow-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
        active
          ? toneActive
          : "border border-line bg-surface text-muted hover:bg-surface-soft hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
          active ? "bg-white/20" : "bg-line/60"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function DriverCard({ driver }: { driver: Driver }) {
  const isRejected = driver.status === "rejected";
  const isActive = driver.status === "active";
  const submitted = new Date(driver.submittedAt);
  const ago = relativeTime(submitted);
  const docPct = Math.round((driver.docsUploaded / TOTAL_REQUIRED_DOCS) * 100);

  const avatarBg = isActive
    ? "bg-emerald-600"
    : isRejected
      ? "bg-rajlo-red"
      : "bg-rajlo-black";
  const avatarIcon = isActive
    ? "check-circle"
    : isRejected
      ? "alert-triangle"
      : "clipboard-check";

  // Status pill — broken out so we can place it inline with the
  // name on mobile (where the third stats column doesn't fit) and
  // as the third column on desktop. Same component, two slots.
  const statusPill = (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : isRejected
            ? "bg-primary-soft text-rajlo-red ring-rajlo-red/30"
            : "bg-amber-50 text-amber-800 ring-amber-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isActive
            ? "bg-emerald-500"
            : isRejected
              ? "bg-rajlo-red"
              : "bg-amber-500"
        }`}
      />
      {isActive ? "Active" : isRejected ? "Resubmit" : "Pending"}
    </span>
  );

  return (
    <Link
      href={`/admin/verification-detail?driverId=${encodeURIComponent(driver.externalId)}`}
      className="group block rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-rajlo-red hover:shadow-md md:flex md:items-center md:gap-5 md:p-5"
    >
      {/* Top row: avatar + name on the left, status pill on the right.
         On desktop this row is the leftmost column of the flex layout
         and the status pill moves into the stats column below. */}
      <div className="flex items-start gap-3 md:min-w-[220px] md:flex-1">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm ${avatarBg}`}
        >
          <Icon name={avatarIcon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold tracking-tight">
            {driver.name}
          </p>
          <p className="truncate text-xs text-muted">
            {driver.externalId} · {driver.plateNumber ?? "no plate"}
          </p>
        </div>
        {/* Mobile-only: the status pill rides up here so admins can
           tell at a glance which queue a row belongs to without
           scrolling sideways. Hidden on md+ where there's room for
           a dedicated Status column. */}
        <span className="md:hidden">{statusPill}</span>
      </div>

      {/* Stats — 2-col on mobile (Submitted + Documents), 3-col on
         desktop (adds the Status column with the pill). */}
      <div className="mt-4 grid flex-1 grid-cols-2 gap-3 md:mt-0 md:grid-cols-3 md:gap-5">
        <Stat
          label={isActive ? "Activated" : "Submitted"}
          value={ago}
          tone={!isActive && hoursSince(submitted) > 48 ? "warn" : "default"}
        />
        <Stat
          label="Documents"
          value={`${driver.docsUploaded}/${TOTAL_REQUIRED_DOCS}`}
          progress={docPct}
        />
        <div className="hidden md:block">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            Status
          </p>
          <div className="mt-1">{statusPill}</div>
        </div>
      </div>

      {/* Chevron is desktop-only — on mobile the entire card is the
         tap target so an extra arrow at the bottom of the card just
         eats vertical space without adding meaning. */}
      <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition-all group-hover:bg-rajlo-red group-hover:text-white md:grid">
        <Icon name="chevron-right" className="h-4 w-4" />
      </span>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  progress,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
  progress?: number;
}) {
  return (
    <div>
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold ${
          tone === "warn" ? "text-amber-700" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {typeof progress === "number" && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-rajlo-red transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function relativeTime(date: Date): string {
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function hoursSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}
