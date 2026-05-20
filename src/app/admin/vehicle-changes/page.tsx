"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";

/**
 * Admin vehicle-change request queue. Lists pending requests
 * (default) — admin clicks one to expand, see the diff between
 * current and requested vehicle, view the docs, and approve/reject
 * with a note.
 *
 * Approved requests apply server-side: drivers row is updated, the
 * three core compliance docs are replaced with the newly-uploaded
 * paths (status pending so the existing verification flow re-reviews
 * them in context), and an audit row is logged.
 *
 * Status filter pills at the top let the admin look at decided
 * requests too — useful for spotting patterns / debugging a
 * mis-routed approval.
 */

type ChangeRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  submittedAt: string;
  reviewedAt: string | null;
  note: string | null;
  adminNote: string | null;
  requested: {
    type: string;
    brand: string;
    model: string;
    year: number;
    color: string;
    plate: string | null;
  };
  docs: {
    insurance: string | null;
    registration: string | null;
    cof: string | null;
  };
  driver: {
    id: string;
    externalId: string | null;
    name: string;
    currentVehicle: {
      type: string | null;
      brand: string | null;
      model: string | null;
      year: number | null;
      color: string | null;
      plate: string | null;
    };
  } | null;
};

type StatusFilter = "pending" | "approved" | "rejected" | "cancelled" | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const PAGE_SIZE = 100;

export default function AdminVehicleChangesPage() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 20s cadence — vehicle change requests trickle in throughout the
  // day; this is enough to surface them quickly without spamming.
  const url = `/api/admin/vehicle-changes?status=${filter}&limit=${PAGE_SIZE}&offset=0`;
  const query = useLiveQuery<{
    requests: ChangeRequest[];
    pagination?: { hasMore: boolean };
  }>(url, { interval: 20_000 });

  const [extra, setExtra] = useState<ChangeRequest[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setHasMoreOlder(true);
    setLoadMoreError(null);
  }, [url]);

  const firstPage = query.data?.requests ?? [];
  const firstIds = new Set(firstPage.map((r) => r.id));
  const requests: ChangeRequest[] = [
    ...firstPage,
    ...extra.filter((r) => !firstIds.has(r.id)),
  ];
  const canLoadMore =
    extra.length === 0
      ? (query.data?.pagination?.hasMore ?? false)
      : hasMoreOlder;
  const loading = query.loading;
  const error = query.error;
  const refresh = () => void query.refresh();

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(url, window.location.origin);
      next.searchParams.set("offset", String(requests.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        requests: ChangeRequest[];
        pagination?: { hasMore: boolean };
      };
      setExtra((prev) => {
        const seen = new Set([
          ...firstPage.map((r) => r.id),
          ...prev.map((r) => r.id),
        ]);
        return [...prev, ...json.requests.filter((r) => !seen.has(r.id))];
      });
      setHasMoreOlder(json.pagination?.hasMore ?? false);
    } catch (e) {
      setLoadMoreError(
        e instanceof Error ? e.message : "Couldn't load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-2 py-6 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -right-20 -bottom-24 opacity-[0.18]"
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                  Compliance review
                </p>
                <LiveIndicator
                  variant="dark"
                  lastUpdated={query.lastUpdated}
                  refreshing={query.refreshing}
                  onRefresh={refresh}
                />
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                Vehicle change requests
              </h1>
              <p className="mt-1 text-sm text-white/75">
                Drivers can&apos;t self-edit their vehicle — they submit a
                request with new docs, and you decide.
              </p>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Status filter */}
      <FadeUp delay={0.05}>
        <div className="-mx-2 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface-soft p-1">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFilter(f.key);
                    setExpandedId(null);
                  }}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
                    active
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-5 space-y-3">
              <Skeleton className="h-3 w-32" rounded="md" />
              <Skeleton className="h-4 w-2/3 max-w-64" rounded="md" />
              <Skeleton className="h-12 w-full" rounded="xl" />
            </div>
          ))}
        </div>
      )}

      {!loading && requests.length === 0 && !error && (
        <FadeUp delay={0.08}>
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-muted">
              <Icon name="check-circle" className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold tracking-tight">
              {filter === "pending"
                ? "Nothing to review"
                : `No ${filter} requests`}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              {filter === "pending"
                ? "All caught up. New requests show up here as drivers submit them."
                : "Switch filters above to see other states."}
            </p>
          </div>
        </FadeUp>
      )}

      {!loading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              expanded={expandedId === r.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === r.id ? null : r.id))
              }
              onActed={refresh}
            />
          ))}
          {canLoadMore && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                ) : null}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
          {loadMoreError && (
            <p className="text-center text-xs font-semibold text-rajlo-red">
              {loadMoreError}
            </p>
          )}
        </div>
      )}

      <FadeUp delay={0.2}>
        <p className="text-center text-[11px] text-muted">
          <Link
            href="/admin"
            className="text-rajlo-red hover:underline"
          >
            ← Back to operations
          </Link>
        </p>
      </FadeUp>
    </div>
  );
}

/* ─────────── Request card ─────────── */

function RequestCard({
  req,
  expanded,
  onToggle,
  onActed,
}: {
  req: ChangeRequest;
  expanded: boolean;
  onToggle: () => void;
  onActed: () => void;
}) {
  const submitted = new Date(req.submittedAt).toLocaleString("en-JM", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const current = req.driver?.currentVehicle;
  const currentLine = current
    ? [current.year, current.color, current.brand, current.model]
        .filter(Boolean)
        .join(" ") || "—"
    : "—";
  const requestedLine =
    `${req.requested.year} ${req.requested.color} ${req.requested.brand} ${req.requested.model}`;

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-surface transition-all ${
        expanded
          ? "border-rajlo-red/40 shadow-lg shadow-rajlo-red/10"
          : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-4 p-5 text-left transition-colors hover:bg-surface-soft"
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${STATUS_BADGE[req.status].iconBg}`}>
          <Icon name="car" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-extrabold tracking-tight">
              {req.driver?.name ?? "Driver"}
            </p>
            {req.driver?.externalId && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                {req.driver.externalId}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[req.status].pill}`}
            >
              {req.status}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            {currentLine}
            <span className="mx-2 inline-block text-rajlo-red">→</span>
            <span className="font-semibold text-rajlo-black">
              {requestedLine}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Submitted {submitted}
          </p>
        </div>
        <Icon
          name="chevron-right"
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${
            expanded ? "rotate-90 text-rajlo-red" : ""
          }`}
        />
      </button>

      {expanded && <ExpandedReview req={req} onActed={onActed} />}
    </div>
  );
}

const STATUS_BADGE: Record<
  ChangeRequest["status"],
  { pill: string; iconBg: string }
> = {
  pending: {
    pill: "bg-amber-100 text-amber-800",
    iconBg: "bg-amber-100 text-amber-700",
  },
  approved: {
    pill: "bg-emerald-100 text-emerald-700",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  rejected: {
    pill: "bg-rajlo-red/10 text-rajlo-red",
    iconBg: "bg-rajlo-red/10 text-rajlo-red",
  },
  cancelled: {
    pill: "bg-rajlo-black/10 text-rajlo-black",
    iconBg: "bg-rajlo-black/10 text-rajlo-black",
  },
};

/* ─────────── Expanded review block ─────────── */

function ExpandedReview({
  req,
  onActed,
}: {
  req: ChangeRequest;
  onActed: () => void;
}) {
  const [note, setNote] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decided = req.status !== "pending";

  const handleDecide = async (decision: "approve" | "reject") => {
    if (decision === "reject" && !note.trim()) {
      setError("Add a note explaining why this is being rejected.");
      return;
    }
    setActing(decision);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vehicle-changes/${req.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onActed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit decision.");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-4 border-t border-line bg-surface-soft px-5 py-5">
      {/* Diff */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DiffCard
          label="Current vehicle"
          tone="muted"
          spec={req.driver?.currentVehicle}
        />
        <DiffCard
          label="Requested vehicle"
          tone="primary"
          spec={{
            type: req.requested.type,
            brand: req.requested.brand,
            model: req.requested.model,
            year: req.requested.year,
            color: req.requested.color,
            plate: req.requested.plate,
          }}
        />
      </div>

      {/* Driver's note */}
      {req.note && (
        <div className="rounded-xl bg-white px-4 py-3">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
            Driver&apos;s note
          </p>
          <p className="mt-1 text-sm">{req.note}</p>
        </div>
      )}

      {/* Documents */}
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-muted">
          Submitted documents
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <DocLink
            label="Registration"
            path={req.docs.registration}
          />
          <DocLink label="COF" path={req.docs.cof} />
          <DocLink
            label="PPV insurance"
            path={req.docs.insurance}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          On approve, these replace the driver&apos;s registration / COF /
          insurance entries and re-enter the verification queue.
        </p>
      </div>

      {/* Already-decided info */}
      {decided && req.adminNote && (
        <div
          className={`rounded-xl px-4 py-3 ${
            req.status === "rejected"
              ? "bg-rajlo-red/10 text-rajlo-red"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider">
            Admin note
          </p>
          <p className="mt-1 text-sm font-semibold">{req.adminNote}</p>
        </div>
      )}

      {/* Action panel — only on pending */}
      {!decided && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted">
              Note for the driver
              <span className="ml-1 text-[10px] font-medium text-muted/70">
                required for reject
              </span>
            </span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="e.g. COF expired — submit current one"
              className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
            />
          </label>
          {error && (
            <p className="text-xs font-semibold text-rajlo-red">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleDecide("reject")}
              disabled={!!acting}
              className="flex-1 rounded-full border border-rajlo-red/40 bg-white px-5 py-3 text-sm font-bold text-rajlo-red transition-colors hover:bg-primary-soft disabled:opacity-60"
            >
              {acting === "reject" ? "Rejecting…" : "Reject"}
            </button>
            <button
              type="button"
              onClick={() => handleDecide("approve")}
              disabled={!!acting}
              className="flex-1 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 disabled:opacity-60 disabled:hover:-translate-y-0"
            >
              {acting === "approve" ? "Approving…" : "Approve change"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffCard({
  label,
  tone,
  spec,
}: {
  label: string;
  tone: "muted" | "primary";
  spec: {
    type: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    plate: string | null;
  } | null | undefined;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "primary"
          ? "border-rajlo-red/40 bg-primary-soft"
          : "border-line bg-white"
      }`}
    >
      <p
        className={`font-secondary text-[10px] font-bold uppercase tracking-wider ${
          tone === "primary" ? "text-rajlo-red" : "text-muted"
        }`}
      >
        {label}
      </p>
      <div className="mt-2 space-y-1 text-xs">
        <DiffRow label="Type" value={spec?.type ?? "—"} />
        <DiffRow label="Brand" value={spec?.brand ?? "—"} />
        <DiffRow label="Model" value={spec?.model ?? "—"} />
        <DiffRow
          label="Year"
          value={spec?.year ? String(spec.year) : "—"}
        />
        <DiffRow label="Colour" value={spec?.color ?? "—"} />
        <DiffRow label="Plate" value={spec?.plate ?? "—"} />
      </div>
    </div>
  );
}

function DiffRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function DocLink({
  label,
  path,
}: {
  label: string;
  path: string | null;
}) {
  // The driver-documents bucket is private — admins view docs via
  // the existing /api/admin/document-url signing endpoint. Pass
  // path as a query param so it generates a fresh signed URL.
  if (!path) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface-soft px-3 py-2 text-[11px] text-muted">
        {label}
        <span className="block">missing</span>
      </div>
    );
  }
  return (
    <a
      href={`/api/admin/document-url?path=${encodeURIComponent(path)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-semibold transition-colors hover:border-rajlo-red hover:bg-primary-soft hover:text-rajlo-red"
    >
      <Icon name="file-text" className="h-3.5 w-3.5" />
      <span className="flex-1 truncate">{label}</span>
      <Icon
        name="arrow-right"
        className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
      />
    </a>
  );
}
