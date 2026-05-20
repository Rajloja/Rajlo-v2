"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { ArcWatermark } from "@/components/arc-pattern";
import { FadeUp } from "@/components/anim";
import { ListRowSkeleton } from "@/components/skeleton";
import { AreaChart, StatNumber, ProgressRow } from "@/components/charts";
import type { AreaPoint } from "@/components/charts";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/transactions — money-flow analytics.
 *
 * Hero stats (in / out / net / count) + an in/out trend area chart
 * over the selected window, kind breakdown bars, top spenders +
 * earners, and a filterable transaction table.
 *
 * Polls every 30s so the dashboard stays current without a manual
 * refresh.
 */

type Totals = {
  inJmd: number;
  outJmd: number;
  netJmd: number;
  countTotal: number;
  byKind: Record<string, { in: number; out: number; count: number }>;
};

type DailyPoint = {
  day: string;
  inJmd: number;
  outJmd: number;
  netJmd: number;
};

type UserStat = {
  userId: string;
  name: string;
  role: string;
  totalJmd: number;
  count: number;
};

type Txn = {
  id: string;
  userId: string;
  direction: "credit" | "debit";
  amountJmd: number;
  kind: string;
  description: string | null;
  balanceAfterJmd: number;
  createdAt: string;
};

type Response = {
  totals: Totals;
  dailySeries: DailyPoint[];
  topSpenders: UserStat[];
  topEarners: UserStat[];
  transactions: Txn[];
  pagination?: { hasMore: boolean };
  usersById: Record<string, { name: string; role: string }>;
};

type Range = "24h" | "7d" | "30d" | "90d" | "1y" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "24h", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "1y", label: "Year" },
  { key: "all", label: "All time" },
];

const KIND_LABEL: Record<string, string> = {
  deposit: "Wallet top-ups",
  ride_charge: "Trip fares paid",
  ride_earning: "Driver earnings",
  withdrawal: "Withdrawals to bank",
  withdrawal_refund: "Refunded withdrawals",
  transfer_out: "Transfers (sent)",
  transfer_in: "Transfers (received)",
  admin_credit: "Admin credits",
  admin_debit: "Admin debits",
  refund: "Refunds",
};

export default function AdminTransactionsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<
    "all" | "credit" | "debit"
  >("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const PAGE_SIZE = 200;
  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("range", range);
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (directionFilter !== "all") params.set("direction", directionFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", "0");
    return `/api/admin/transactions?${params.toString()}`;
  }, [range, kindFilter, directionFilter, debouncedSearch]);


  const query = useLiveQuery<Response>(url, { interval: 30_000 });
  const data = query.data;
  const loading = !data && !query.error;

  // Pagination — `extraTxns` holds older pages loaded via "Load more"
  // so the 30s live refresh of the first page doesn't wipe them.
  // Reset whenever the underlying URL (filters / range / search)
  // changes — that's a different result set.
  const [extraTxns, setExtraTxns] = useState<Txn[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtraTxns([]);
    setHasMoreOlder(true);
    setLoadMoreError(null);
  }, [url]);

  const firstPageTxns: Txn[] = data?.transactions ?? [];
  const firstPageIds = new Set(firstPageTxns.map((t) => t.id));
  const mergedTxns: Txn[] = [
    ...firstPageTxns,
    ...extraTxns.filter((t) => !firstPageIds.has(t.id)),
  ];
  // First page's hasMore drives the button until older pages are
  // loaded; after that the last loadMore response's value takes over.
  const canLoadMore =
    extraTxns.length === 0
      ? (data?.pagination?.hasMore ?? false)
      : hasMoreOlder;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(url, window.location.origin);
      next.searchParams.set("offset", String(mergedTxns.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Response;
      setExtraTxns((prev) => {
        const seen = new Set([
          ...firstPageTxns.map((t) => t.id),
          ...prev.map((t) => t.id),
        ]);
        return [...prev, ...json.transactions.filter((t) => !seen.has(t.id))];
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

  const inSeries: AreaPoint[] = useMemo(
    () =>
      (data?.dailySeries ?? []).map((d) => ({
        label: friendlyDayLabel(d.day),
        value: d.inJmd,
      })),
    [data?.dailySeries],
  );
  const outSeries: AreaPoint[] = useMemo(
    () =>
      (data?.dailySeries ?? []).map((d) => ({
        label: friendlyDayLabel(d.day),
        value: d.outJmd,
      })),
    [data?.dailySeries],
  );

  // Roll into the bar breakdown — sort by total volume desc.
  const kindBreakdown = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.totals.byKind)
      .map(([kind, v]) => ({
        kind,
        label: KIND_LABEL[kind] ?? kind,
        total: v.in + v.out,
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);
  const kindMax = Math.max(1, ...kindBreakdown.map((k) => k.total));

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
              Transactions
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
              Money in · money out
            </h1>
            <p className="mt-1 text-sm text-white/75">
              Wallet flow across riders + drivers. Filter by window, kind, or
              direction.
            </p>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    range === r.key
                      ? "bg-rajlo-red text-white"
                      : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </FadeUp>

      {/* Hero stats */}
      <FadeUp delay={0.04}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatNumber
            eyebrow="Money in"
            value={formatJMD(data?.totals.inJmd ?? 0)}
            caption="Credits to wallets"
          />
          <StatNumber
            eyebrow="Money out"
            value={formatJMD(data?.totals.outJmd ?? 0)}
            caption="Debits from wallets"
            invertColors
          />
          <StatNumber
            eyebrow="Net"
            value={formatJMD(data?.totals.netJmd ?? 0)}
            caption="Inflow minus outflow"
            invertColors={(data?.totals.netJmd ?? 0) < 0}
          />
          <StatNumber
            eyebrow="Transactions"
            value={String(data?.totals.countTotal ?? 0)}
            caption={
              range === "all" ? "Total recorded" : `In selected window`
            }
          />
        </div>
      </FadeUp>

      {/* Charts */}
      {data && data.dailySeries.length > 0 && (
        <FadeUp delay={0.06}>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Money in · daily
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">
                {formatJMD(data.totals.inJmd)}
              </h2>
              <div className="mt-4">
                <AreaChart
                  data={inSeries}
                  height={180}
                  accent="emerald"
                  formatValue={(n) => formatJMD(n)}
                />
              </div>
            </section>
            <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
              <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
                Money out · daily
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">
                {formatJMD(data.totals.outJmd)}
              </h2>
              <div className="mt-4">
                <AreaChart
                  data={outSeries}
                  height={180}
                  accent="red"
                  formatValue={(n) => formatJMD(n)}
                />
              </div>
            </section>
          </div>
        </FadeUp>
      )}

      {/* Kind breakdown */}
      {kindBreakdown.length > 0 && (
        <FadeUp delay={0.08}>
          <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Volume by kind
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">
              Where the money moved
            </h2>
            <div className="mt-4 space-y-2">
              {kindBreakdown.map((k, i) => (
                <ProgressRow
                  key={k.kind}
                  rank={i + 1}
                  label={k.label}
                  caption={`${k.count} txn${k.count === 1 ? "" : "s"}`}
                  spendJMD={k.total}
                  share={k.total / kindMax}
                />
              ))}
            </div>
          </section>
        </FadeUp>
      )}

      {/* Top spenders + earners */}
      {data && (data.topSpenders.length > 0 || data.topEarners.length > 0) && (
        <FadeUp delay={0.1}>
          <div className="grid gap-4 md:grid-cols-2">
            <TopList
              eyebrow="Top spenders"
              hint="Biggest debits in this window"
              tone="red"
              rows={data.topSpenders}
            />
            <TopList
              eyebrow="Top earners"
              hint="Biggest credits in this window"
              tone="emerald"
              rows={data.topEarners}
            />
          </div>
        </FadeUp>
      )}

      {/* Filters + transaction list */}
      <FadeUp delay={0.12}>
        <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search by user name</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search transactions by user name"
                className="block w-full rounded-xl border border-line bg-surface-soft py-2.5 pl-10 pr-4 text-sm font-medium outline-none placeholder:text-muted focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/20"
              />
            </label>
            <div className="inline-flex overflow-hidden rounded-full border border-line text-[11px] font-bold">
              {(["all", "credit", "debit"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirectionFilter(d)}
                  className={`px-3 py-2 ${
                    directionFilter === d
                      ? "bg-rajlo-black text-white"
                      : "bg-surface text-muted hover:bg-surface-soft"
                  }`}
                >
                  {d === "all" ? "All" : d === "credit" ? "In" : "Out"}
                </button>
              ))}
            </div>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-rajlo-red"
            >
              <option value="all">All kinds</option>
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </section>
      </FadeUp>

      {query.error && (
        <div className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          Couldn&apos;t load transactions: {query.error}
        </div>
      )}

      {loading && (
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      )}

      {data && mergedTxns.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-10 text-center">
          <p className="text-sm font-bold">No transactions match these filters</p>
        </div>
      )}

      {data && mergedTxns.length > 0 && (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-2.5 md:hidden">
            {mergedTxns.map((t) => (
              <li
                key={t.id}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {data.usersById[t.userId]?.name ?? "Unknown"}
                    </p>
                    <p className="text-[11px] uppercase tracking-wider text-muted">
                      {data.usersById[t.userId]?.role ?? ""} ·{" "}
                      {KIND_LABEL[t.kind] ?? t.kind}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-base font-extrabold tracking-tight ${
                      t.direction === "credit"
                        ? "text-emerald-700"
                        : "text-rajlo-red"
                    }`}
                  >
                    {t.direction === "credit" ? "+" : "−"}
                    {formatJMD(t.amountJmd)}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
                  <span>{ago(t.createdAt)}</span>
                  <span>Bal · {formatJMD(t.balanceAfterJmd)}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">When</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Kind</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {mergedTxns.map((t, i) => (
                  <tr key={t.id} className={i > 0 ? "border-t border-line" : ""}>
                    <td className="px-4 py-3 text-[11px] text-muted">
                      {ago(t.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold">
                        {data.usersById[t.userId]?.name ?? "Unknown"}
                      </p>
                      <p className="text-[11px] uppercase tracking-wider text-muted">
                        {data.usersById[t.userId]?.role ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {KIND_LABEL[t.kind] ?? t.kind}
                      {t.description && (
                        <p className="mt-0.5 max-w-xs truncate text-[10px] italic text-muted">
                          “{t.description}”
                        </p>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-extrabold ${
                        t.direction === "credit"
                          ? "text-emerald-700"
                          : "text-rajlo-red"
                      }`}
                    >
                      {t.direction === "credit" ? "+" : "−"}
                      {formatJMD(t.amountJmd)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatJMD(t.balanceAfterJmd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more — common to both mobile + desktop renders. */}
          {canLoadMore && (
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

function TopList({
  eyebrow,
  hint,
  tone,
  rows,
}: {
  eyebrow: string;
  hint: string;
  tone: "red" | "emerald";
  rows: UserStat[];
}) {
  const accent =
    tone === "red"
      ? "bg-rajlo-red text-white"
      : "bg-emerald-600 text-white";
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
      <p
        className={`font-secondary text-[10px] font-bold uppercase tracking-wider ${
          tone === "red" ? "text-rajlo-red" : "text-emerald-700"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-extrabold tracking-tight md:text-xl">
        {hint}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted">No data in this window.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <li
              key={r.userId}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface-soft px-3 py-2"
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold ${accent}`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  {r.role} · {r.count} txn{r.count === 1 ? "" : "s"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-extrabold tracking-tight">
                {formatJMD(r.totalJmd)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function friendlyDayLabel(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}
