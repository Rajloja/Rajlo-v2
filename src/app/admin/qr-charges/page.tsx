"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { ListRowSkeleton } from "@/components/skeleton";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/qr-charges — QR Pay reconciliation.
 *
 * Paginated table of every QR charge with status filters, date range,
 * and roll-up totals across the filtered set. Drives the admin's
 * day-end "what did the platform earn?" review.
 */

type ChargeRow = {
  id: string;
  code: string;
  amountJmd: number;
  description: string | null;
  status: "pending" | "confirmed" | "expired" | "cancelled";
  expiresAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  commissionJmd: number | null;
  driverEarningsJmd: number | null;
  createdAt: string;
  driver: { externalId: string; name: string; plate: string | null } | null;
  rider: { name: string } | null;
};

type Totals = {
  chargeCount: number;
  settledCount: number;
  grossJmd: number;
  driverEarningsJmd: number;
  commissionJmd: number;
};

type Response = {
  charges: ChargeRow[];
  pagination?: { hasMore: boolean };
  totals: Totals;
};

const PAGE_SIZE = 200;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Settled" },
  { value: "pending", label: "Pending" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function AdminQrChargesPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>(
    "all",
  );
  const [days, setDays] = useState<number>(7);
  const [search, setSearch] = useState("");
  // Pagination — older pages loaded via "Load more" accumulate here so
  // a refresh of page 0 doesn't wipe them. Refresh resets the stack.
  const [extraCharges, setExtraCharges] = useState<ChargeRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({ status });
      if (days > 0) {
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        params.set("since", since);
      }
      if (search.trim()) params.set("q", search.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      return params;
    },
    [status, days, search],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/qr-charges?${buildParams(0).toString()}`,
      );
      if (!res.ok) throw new Error("Failed to load QR charges");
      const json = (await res.json()) as Response;
      setData(json);
      setExtraCharges([]);
      setHasMoreOlder(json.pagination?.hasMore ?? false);
      setLoadMoreError(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load charges");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const firstPageCharges = data?.charges ?? [];
  const firstPageIds = new Set(firstPageCharges.map((c) => c.id));
  const charges: ChargeRow[] = [
    ...firstPageCharges,
    ...extraCharges.filter((c) => !firstPageIds.has(c.id)),
  ];

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(
        `/api/admin/qr-charges?${buildParams(charges.length).toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Response;
      setExtraCharges((prev) => {
        const seen = new Set([
          ...firstPageCharges.map((c) => c.id),
          ...prev.map((c) => c.id),
        ]);
        return [...prev, ...json.charges.filter((c) => !seen.has(c.id))];
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
    <div className="space-y-6">
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl shadow-rajlo-black/30 md:p-10">
          <ArcWatermark
            size={520}
            variant="white"
            className="absolute -right-24 -top-24 opacity-[0.06]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              QR Pay
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
              Reconciliation
            </h1>
            <p className="mt-1 text-sm text-white/75">
              Every driver-initiated charge with totals across the filtered set.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat
                label="Settled"
                value={data?.totals.settledCount ?? 0}
                hint={`of ${data?.totals.chargeCount ?? 0} matching`}
              />
              <Stat
                label="Gross charged"
                value={formatJMD(data?.totals.grossJmd ?? 0)}
                hint="rider wallet debits"
              />
              <Stat
                label="Driver earnings"
                value={formatJMD(data?.totals.driverEarningsJmd ?? 0)}
                hint="post-commission"
              />
              <Stat
                label="Platform commission"
                value={formatJMD(data?.totals.commissionJmd ?? 0)}
                hint="Rajlo's cut"
              />
            </div>
          </div>
        </section>
      </FadeUp>

      <FadeUp delay={0.04}>
        <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search by code</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by 8-char code"
                className="block w-full rounded-xl border border-line bg-surface-soft py-2.5 pl-10 pr-4 text-sm font-medium outline-none placeholder:text-muted focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/20"
              />
            </label>

            <div className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-bold">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  className={`px-3 py-2 ${
                    status === f.value
                      ? "bg-rajlo-black text-white"
                      : "bg-surface text-muted hover:bg-surface-soft"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-bold">
              {[1, 7, 30, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`px-3 py-2 ${
                    days === d
                      ? "bg-rajlo-red text-white"
                      : "bg-surface text-muted hover:bg-surface-soft"
                  }`}
                >
                  {d === 0 ? "All time" : d === 1 ? "24h" : `${d}d`}
                </button>
              ))}
            </div>
          </div>
        </section>
      </FadeUp>

      {error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && data && charges.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-10 text-center">
          <p className="text-sm font-bold">No QR charges match those filters</p>
        </div>
      )}

      {!loading && data && charges.length > 0 && (
        <>
          {/* Mobile: stacked cards. Each charge gets its own card so
             the gross / driver / commission split is readable without
             horizontal scrolling. */}
          <ul className="space-y-2.5 md:hidden">
            {charges.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold tracking-wider">
                      {c.code}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {timeAgo(c.confirmedAt ?? c.cancelledAt ?? c.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={c.status} />
                </div>

                {c.description && (
                  <p className="mt-2 truncate text-[11px] italic text-muted">
                    “{c.description}”
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-secondary text-[9px] font-bold uppercase tracking-wider text-muted">
                      Driver
                    </p>
                    <p className="mt-0.5 font-bold">
                      {c.driver?.name ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted">
                      {c.driver?.externalId ?? ""}
                      {c.driver?.plate ? ` · ${c.driver.plate}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="font-secondary text-[9px] font-bold uppercase tracking-wider text-muted">
                      Rider
                    </p>
                    <p className="mt-0.5 font-bold">
                      {c.rider?.name ?? (
                        <span className="text-muted">unpaid</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-right">
                  <div>
                    <p className="font-secondary text-[9px] font-bold uppercase tracking-wider text-muted">
                      Charged
                    </p>
                    <p className="text-sm font-extrabold">
                      {formatJMD(c.amountJmd)}
                    </p>
                  </div>
                  <div>
                    <p className="font-secondary text-[9px] font-bold uppercase tracking-wider text-muted">
                      Driver
                    </p>
                    <p className="text-sm font-extrabold text-emerald-700">
                      {c.driverEarningsJmd != null
                        ? formatJMD(c.driverEarningsJmd)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="font-secondary text-[9px] font-bold uppercase tracking-wider text-muted">
                      Commission
                    </p>
                    <p className="text-sm font-extrabold text-muted">
                      {c.commissionJmd != null
                        ? formatJMD(c.commissionJmd)
                        : "—"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: full table. */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Code · When</th>
                  <th className="px-4 py-3 text-left">Driver</th>
                  <th className="px-4 py-3 text-left">Rider</th>
                  <th className="px-4 py-3 text-right">Charged</th>
                  <th className="px-4 py-3 text-right">Driver got</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c, i) => (
                  <tr key={c.id} className={i > 0 ? "border-t border-line" : ""}>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold tracking-wider">
                        {c.code}
                      </p>
                      <p className="text-[10px] text-muted">
                        {timeAgo(c.confirmedAt ?? c.cancelledAt ?? c.createdAt)}
                      </p>
                      {c.description && (
                        <p className="mt-1 max-w-xs truncate text-[10px] italic text-muted">
                          “{c.description}”
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.driver ? (
                        <>
                          <p className="font-bold">{c.driver.name}</p>
                          <p className="text-[10px] text-muted">
                            {c.driver.externalId}
                            {c.driver.plate ? ` · ${c.driver.plate}` : ""}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.rider ? (
                        <p className="font-bold">{c.rider.name}</p>
                      ) : (
                        <span className="text-[11px] text-muted">unpaid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatJMD(c.amountJmd)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {c.driverEarningsJmd != null
                        ? formatJMD(c.driverEarningsJmd)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {c.commissionJmd != null
                        ? formatJMD(c.commissionJmd)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusPill status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMoreOlder && (
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
                ) : null}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
          {loadMoreError && (
            <p className="pt-2 text-center text-[11px] font-semibold text-rajlo-red">
              {loadMoreError}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ChargeRow["status"] }) {
  const meta =
    status === "confirmed"
      ? { label: "Settled", classes: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
      : status === "pending"
        ? { label: "Pending", classes: "bg-amber-50 text-amber-800 ring-amber-200" }
        : status === "expired"
          ? { label: "Expired", classes: "bg-surface-soft text-muted ring-line" }
          : { label: "Cancelled", classes: "bg-primary-soft text-rajlo-red ring-rajlo-red/30" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-white/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[10px] text-white/55">{hint}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
