"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useLiveQuery } from "@/lib/use-live-query";

/**
 * Admin driver violations queue. Lists location-policy violations
 * with inline resolve + full-driver reactivate actions. The
 * 2-strike auto-deactivation that fires server-side gets cleared
 * the moment an admin reactivates here — drivers don't have to
 * resubmit any documents.
 */

type Violation = {
  id: string;
  driverId: string;
  driverName: string;
  driverPlate: string | null;
  driverActivated: boolean;
  driverDeactivatedAt: string | null;
  driverDeactivationReason: string | null;
  rideId: string | null;
  kind: string;
  details: string | null;
  resolvedAt: string | null;
  adminNotes: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  location_off_mid_trip: "Location off mid-trip",
  location_off_while_online: "Location off while online",
  permission_denied_at_toggle: "Denied permission at toggle",
};

const PAGE_SIZE = 100;

export default function AdminViolationsPage() {
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);

  // First page — polled every 15s so newly-created violations surface
  // automatically. Additional pages appended via loadMore + kept out
  // of the polling refresh so older entries don't blink in and out.
  const url = `/api/admin/driver-violations?status=${status}&limit=${PAGE_SIZE}&offset=0`;
  const query = useLiveQuery<{ violations: Violation[]; total: number }>(url, {
    interval: 15_000,
  });
  const firstPage = query.data?.violations ?? [];
  const total = query.data?.total ?? 0;

  const [extras, setExtras] = useState<Violation[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Reset appended pages when filter changes / first page refreshes.
  useEffect(() => {
    setExtras([]);
    setLoadMoreError(null);
  }, [status, query.data?.violations]);

  const violations = [
    ...firstPage,
    ...extras.filter((e) => !firstPage.some((f) => f.id === e.id)),
  ];
  const hasMore = violations.length < total;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(
        `/api/admin/driver-violations?status=${status}&limit=${PAGE_SIZE}&offset=${violations.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        violations: Violation[];
        total: number;
      };
      setExtras((prev) => {
        const seen = new Set([
          ...firstPage.map((v) => v.id),
          ...prev.map((v) => v.id),
        ]);
        return [...prev, ...json.violations.filter((v) => !seen.has(v.id))];
      });
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const act = async (
    violationId: string,
    action: "resolve" | "reactivate",
    notes?: string,
  ) => {
    setBusy(violationId);
    try {
      await fetch(`/api/admin/driver-violations/${violationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      query.refresh?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-2 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <div className="rounded-3xl border border-line bg-surface p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Driver violations
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              Location-policy violations
            </h1>
            <p className="mt-1 text-sm text-muted">
              Drivers caught with location off during a trip. Two
              unresolved strikes auto-deactivate the driver — they have
              to contact support and you reactivate here.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-rajlo-red px-4 py-3 text-center text-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
              Showing
            </p>
            <p className="text-3xl font-extrabold tabular-nums">
              {query.data?.total ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Status
        </span>
        {(["open", "resolved", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              status === s
                ? "bg-rajlo-red text-white"
                : "bg-surface-soft text-foreground hover:bg-primary-soft/50"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {query.loading && violations.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center text-sm text-muted">
          Loading violations…
        </div>
      ) : violations.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <p className="text-base font-semibold">
            {status === "open"
              ? "All clear — no open violations right now."
              : "No violations match these filters."}
          </p>
          <p className="mt-2 text-sm text-muted">
            Violations fire automatically when a driver turns location
            off during an in-progress trip.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {violations.map((v) => (
              <ViolationCard
                key={v.id}
                v={v}
                busy={busy === v.id}
                onResolve={(notes) => act(v.id, "resolve", notes)}
                onReactivate={(notes) => act(v.id, "reactivate", notes)}
              />
            ))}
          </div>
          {(hasMore || loadMoreError) && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {loadMoreError && (
                <p className="text-xs font-semibold text-rajlo-red">
                  {loadMoreError}
                </p>
              )}
              {hasMore && (
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

function ViolationCard({
  v,
  busy,
  onResolve,
  onReactivate,
}: {
  v: Violation;
  busy: boolean;
  onResolve: (notes?: string) => void;
  onReactivate: (notes?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [showActions, setShowActions] = useState(false);

  const isResolved = v.resolvedAt !== null;
  const isDeactivated = !!v.driverDeactivatedAt;

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-surface shadow-sm ${
        isDeactivated && !isResolved
          ? "border-rajlo-red"
          : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
              isResolved
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rajlo-red text-white"
            }`}
          >
            <Icon name="map-pin" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold">
                {KIND_LABEL[v.kind] ?? v.kind}
              </span>
              {isResolved && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Resolved
                </span>
              )}
              {isDeactivated && !isResolved && (
                <span className="inline-flex items-center rounded-full bg-rajlo-red/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                  Driver deactivated
                </span>
              )}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {new Date(v.createdAt).toLocaleString("en-JM", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {v.driverName}
              {v.driverPlate && (
                <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-rajlo-red">
                  {v.driverPlate}
                </span>
              )}
            </p>
            {v.details && (
              <p className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-sm text-muted">
                {v.details}
              </p>
            )}
            {v.adminNotes && (
              <p className="mt-2 text-[12px] italic text-muted">
                Admin: {v.adminNotes}
              </p>
            )}
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {v.driverId.slice(0, 8)}
        </span>
      </div>

      {!isResolved && (
        <div className="border-t border-line bg-surface-soft px-5 py-3">
          {!showActions ? (
            <button
              type="button"
              onClick={() => setShowActions(true)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <Icon name="check-circle" className="h-3 w-3" />
              Review
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)…"
                className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onResolve(notes.trim() || undefined)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Icon name="check-circle" className="h-3 w-3" />
                  Resolve this one
                </button>
                {isDeactivated && (
                  <button
                    type="button"
                    onClick={() => onReactivate(notes.trim() || undefined)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-full bg-rajlo-red px-4 py-1.5 text-xs font-bold text-white hover:bg-rajlo-red/90 disabled:opacity-50"
                  >
                    <Icon name="check-circle" className="h-3 w-3" />
                    Reactivate driver (clear all)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowActions(false);
                    setNotes("");
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-muted">
                Reactivating clears every open violation for this
                driver and removes the deactivation — they don&apos;t
                need to resubmit documents.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
