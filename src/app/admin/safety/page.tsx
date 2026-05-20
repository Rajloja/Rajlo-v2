"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { useLiveQuery } from "@/lib/use-live-query";

/**
 * Admin safety dashboard.
 *
 * Single triage queue for every safety event in the system — manual
 * SOS, manual flag, AND the auto-triggered "unusual stop" check-ins
 * from the rider's app. Ops:
 *   - filters by status (open is the default — the actionable queue)
 *   - filters by kind to focus on real emergencies vs noisy checks
 *   - acknowledges (you're on it) → resolves (it's handled, with a note)
 *
 * Phase 4 hooks for officer-rider chat will land on the per-alert
 * detail view (not built yet — for now ack/resolve happens inline).
 */

type Alert = {
  id: string;
  rideId: string;
  riderId: string;
  riderName: string;
  driverId: string | null;
  kind: "sos" | "flag" | "unusual_stop" | "off_route";
  message: string | null;
  lat: number | null;
  lng: number | null;
  status: "open" | "acknowledged" | "resolved";
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  ride: { pickup: string; dropoff: string; status: string } | null;
};

const KIND_META: Record<
  Alert["kind"],
  { label: string; icon: string; tint: string }
> = {
  sos: {
    label: "SOS",
    icon: "shield-alert",
    tint: "bg-rajlo-red text-white",
  },
  flag: {
    label: "Flag",
    icon: "alert-triangle",
    tint: "bg-amber-500 text-white",
  },
  unusual_stop: {
    label: "Unusual stop",
    icon: "map-pin",
    tint: "bg-amber-200 text-amber-900",
  },
  off_route: {
    label: "Off route",
    icon: "navigation",
    tint: "bg-orange-500 text-white",
  },
};

const STATUS_META: Record<
  Alert["status"],
  { label: string; bg: string; text: string }
> = {
  open: { label: "Open", bg: "bg-rajlo-red/15", text: "text-rajlo-red" },
  acknowledged: {
    label: "Acknowledged",
    bg: "bg-amber-100",
    text: "text-amber-800",
  },
  resolved: { label: "Resolved", bg: "bg-emerald-50", text: "text-emerald-700" },
};

export default function AdminSafetyPage() {
  const [status, setStatus] = useState<"open" | "acknowledged" | "resolved" | "all">("open");
  const [kind, setKind] = useState<"all" | Alert["kind"]>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const PAGE_SIZE = 100;
  const url = `/api/admin/safety-alerts?status=${status}&kind=${kind}&days=30&limit=${PAGE_SIZE}&offset=0`;
  const query = useLiveQuery<{
    alerts: Alert[];
    total: number;
    pagination?: { hasMore: boolean };
  }>(url, {
    interval: 12_000,
  });

  const [extra, setExtra] = useState<Alert[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setHasMoreOlder(true);
    setLoadMoreError(null);
  }, [url]);

  const firstPage = query.data?.alerts ?? [];
  const firstIds = new Set(firstPage.map((a) => a.id));
  const alerts: Alert[] = [
    ...firstPage,
    ...extra.filter((a) => !firstIds.has(a.id)),
  ];
  const total = query.data?.total ?? 0;
  const canLoadMore =
    extra.length === 0
      ? (query.data?.pagination?.hasMore ?? false)
      : hasMoreOlder;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(url, window.location.origin);
      next.searchParams.set("offset", String(alerts.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        alerts: Alert[];
        pagination?: { hasMore: boolean };
      };
      setExtra((prev) => {
        const seen = new Set([
          ...firstPage.map((a) => a.id),
          ...prev.map((a) => a.id),
        ]);
        return [...prev, ...json.alerts.filter((a) => !seen.has(a.id))];
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

  const decide = async (
    alert: Alert,
    next: "acknowledged" | "resolved",
    note?: string,
  ) => {
    setBusy(alert.id);
    try {
      await fetch(`/api/admin/safety-alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, resolution_note: note }),
      });
      // Manual refetch so the row's state updates without waiting for
      // the 12-second poll.
      query.refresh?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-2 py-2 md:px-3 md:py-8">
      {/* ─── Hero ─── */}
      <div className="rounded-3xl border border-line bg-surface p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Safety operations
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              Safety
            </h1>
            <p className="mt-1 text-sm text-muted">
              Every safety signal — manual SOS, soft flags, and auto-detected
              unusual stops. Filter to the open queue to triage.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-rajlo-red px-4 py-3 text-center text-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
              Showing
            </p>
            <p className="text-3xl font-extrabold tabular-nums">{total}</p>
          </div>
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <FilterPills
          label="Status"
          value={status}
          options={[
            { value: "open", label: "Open" },
            { value: "acknowledged", label: "Acknowledged" },
            { value: "resolved", label: "Resolved" },
            { value: "all", label: "All" },
          ]}
          onChange={(v) => setStatus(v as typeof status)}
        />
        <span className="h-5 w-px bg-line" />
        <FilterPills
          label="Kind"
          value={kind}
          options={[
            { value: "all", label: "All kinds" },
            { value: "sos", label: "SOS" },
            { value: "flag", label: "Flags" },
            { value: "unusual_stop", label: "Unusual stops" },
            { value: "off_route", label: "Off route" },
          ]}
          onChange={(v) => setKind(v as typeof kind)}
        />
      </div>

      {/* ─── List ─── */}
      {query.loading && alerts.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center text-sm text-muted">
          Loading safety queue…
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <p className="text-base font-semibold">
            {status === "open"
              ? "All clear — no open safety alerts right now."
              : "No alerts match these filters."}
          </p>
          <p className="mt-2 text-sm text-muted">
            Riders can trigger SOS or flag during any trip. The system also
            auto-creates alerts when a driver stops moving for too long mid-trip.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              busy={busy === a.id}
              onAcknowledge={() => decide(a, "acknowledged")}
              onResolve={(note) => decide(a, "resolved", note)}
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
    </div>
  );
}

function FilterPills({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              value === o.value
                ? "bg-rajlo-red text-white"
                : "bg-surface-soft text-foreground hover:bg-primary-soft/50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  busy,
  onAcknowledge,
  onResolve,
}: {
  alert: Alert;
  busy: boolean;
  onAcknowledge: () => void;
  onResolve: (note?: string) => void;
}) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");

  const kindMeta = KIND_META[alert.kind];
  const statusMeta = STATUS_META[alert.status];
  const ageMin = Math.max(
    0,
    // eslint-disable-next-line react-hooks/purity
    Math.floor((Date.now() - new Date(alert.createdAt).getTime()) / 60_000),
  );
  const mapLink =
    alert.lat !== null && alert.lng !== null
      ? `https://www.google.com/maps?q=${alert.lat},${alert.lng}`
      : null;

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-surface shadow-sm ${
        alert.status === "open" && alert.kind === "sos"
          ? "border-rajlo-red"
          : "border-line"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${kindMeta.tint}`}
          >
            <Icon
              name={kindMeta.icon as never}
              className="h-5 w-5"
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold">{kindMeta.label}</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusMeta.bg} ${statusMeta.text}`}
              >
                {statusMeta.label}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {ageMin} min ago
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {alert.riderName}
              {alert.ride && (
                <span className="font-normal text-muted">
                  {" · "}
                  {alert.ride.pickup} → {alert.ride.dropoff}
                </span>
              )}
            </p>
            {alert.message && (
              <p className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-sm text-muted">
                {alert.message}
              </p>
            )}
            {alert.resolutionNote && alert.status === "resolved" && (
              <p className="mt-2 text-[12px] italic text-muted">
                Resolution: {alert.resolutionNote}
              </p>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="flex shrink-0 items-center gap-2">
          {mapLink && (
            <a
              href={mapLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[11px] font-bold text-foreground hover:border-rajlo-red/40"
            >
              <Icon name="map-pin" className="h-3 w-3" />
              Map
            </a>
          )}
          <Link
            href={`/admin/safety/${alert.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-rajlo-red px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rajlo-red/90"
          >
            <Icon name="mail" className="h-3 w-3" />
            Open thread
          </Link>
          <Link
            href={`/admin/live-trips`}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[11px] font-bold text-foreground hover:border-rajlo-red/40"
          >
            <Icon name="activity" className="h-3 w-3" />
            Live trips
          </Link>
        </div>
      </div>

      {/* Actions */}
      {alert.status !== "resolved" && (
        <div className="border-t border-line bg-surface-soft px-5 py-3">
          {!resolveOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              {alert.status === "open" && (
                <button
                  type="button"
                  onClick={onAcknowledge}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  <Icon name="check-circle" className="h-3 w-3" />
                  Acknowledge
                </button>
              )}
              <button
                type="button"
                onClick={() => setResolveOpen(true)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Icon name="check-circle" className="h-3 w-3" />
                Resolve…
              </button>
              <span className="ml-auto font-mono text-[10px] uppercase text-muted">
                {alert.id.slice(0, 8)}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (optional)…"
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-emerald-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onResolve(note.trim() || undefined);
                  setResolveOpen(false);
                  setNote("");
                }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Save resolution
              </button>
              <button
                type="button"
                onClick={() => {
                  setResolveOpen(false);
                  setNote("");
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
