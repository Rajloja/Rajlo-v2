"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/wallets — every user's wallet at a glance.
 *
 * Filters by role + search. Sortable by balance (default) or
 * newest activity. Click a row to drill into per-user wallet detail
 * where the admin can credit/debit + see every transaction.
 */

type WalletRow = {
  userId: string;
  fullName: string;
  email: string | null;
  role: "rider" | "driver" | "admin";
  balanceJmd: number;
  updatedAt: string;
};

type WalletsResponse = {
  wallets: WalletRow[];
  pagination?: { hasMore: boolean };
  totals: {
    total: number;
    riders: number;
    drivers: number;
    admins: number;
    totalRiderBalance: number;
    totalDriverBalance: number;
  };
};

type RoleFilter = "all" | "rider" | "driver" | "admin";

export default function AdminWalletsPage() {
  const [role, setRole] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"balance" | "newest">("balance");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const PAGE_SIZE = 200;
  const url = (() => {
    const sp = new URLSearchParams();
    if (role !== "all") sp.set("role", role);
    if (debouncedSearch) sp.set("q", debouncedSearch);
    sp.set("sort", sort);
    sp.set("limit", String(PAGE_SIZE));
    sp.set("offset", "0");
    return `/api/admin/wallets?${sp.toString()}`;
  })();

  const query = useLiveQuery<WalletsResponse>(url, { interval: 30_000 });
  const totals = query.data?.totals;

  // Pagination state — same pattern as other admin lists.
  const [extraWallets, setExtraWallets] = useState<WalletRow[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtraWallets([]);
    setHasMoreOlder(true);
    setLoadMoreError(null);
  }, [url]);

  const firstPageWallets = query.data?.wallets ?? [];
  const firstPageIds = new Set(firstPageWallets.map((w) => w.userId));
  const wallets: WalletRow[] = [
    ...firstPageWallets,
    ...extraWallets.filter((w) => !firstPageIds.has(w.userId)),
  ];
  const canLoadMore =
    extraWallets.length === 0
      ? (query.data?.pagination?.hasMore ?? false)
      : hasMoreOlder;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(url, window.location.origin);
      next.searchParams.set("offset", String(wallets.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WalletsResponse;
      setExtraWallets((prev) => {
        const seen = new Set([
          ...firstPageWallets.map((w) => w.userId),
          ...prev.map((w) => w.userId),
        ]);
        return [...prev, ...json.wallets.filter((w) => !seen.has(w.userId))];
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
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-4 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-9">
          <ArcWatermark
            size={460}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.10]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Wallets
              </p>
              <LiveIndicator
                variant="dark"
                lastUpdated={query.lastUpdated}
                refreshing={query.refreshing}
                onRefresh={query.refresh}
              />
            </div>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              Money on the platform
            </h1>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 md:grid-cols-4">
              <Stat
                label="Rider holdings"
                value={totals ? formatJMD(totals.totalRiderBalance) : "—"}
              />
              <Stat
                label="Driver holdings"
                value={totals ? formatJMD(totals.totalDriverBalance) : "—"}
              />
              <Stat label="Riders" value={totals ? String(totals.riders) : "—"} />
              <Stat label="Drivers" value={totals ? String(totals.drivers) : "—"} />
            </div>
          </div>
        </div>
      </FadeUp>

      {/* Filters */}
      <FadeUp delay={0.05}>
        <div className="rounded-2xl border border-line bg-surface p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { v: "all", l: "All" },
                  { v: "rider", l: "Riders" },
                  { v: "driver", l: "Drivers" },
                  { v: "admin", l: "Admins" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setRole(o.v)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    role === o.v
                      ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                      : "bg-surface-soft text-muted hover:text-foreground"
                  }`}
                >
                  {o.l}
                </button>
              ))}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "balance" | "newest")}
                className="rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-semibold focus:border-rajlo-red focus:outline-none"
              >
                <option value="balance">By balance</option>
                <option value="newest">Recently active</option>
              </select>
            </div>
            <label className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email…"
                className="w-full rounded-full border border-line bg-surface-soft py-2.5 pl-9 pr-4 text-sm font-semibold focus:border-rajlo-red focus:outline-none md:w-72"
              />
            </label>
          </div>
        </div>
      </FadeUp>

      {/* List */}
      <FadeUp delay={0.08}>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {query.loading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" rounded="xl" />
              ))}
            </div>
          ) : wallets.length === 0 ? (
            <p className="py-16 text-center text-sm font-bold text-muted">
              No wallets match those filters.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {wallets.map((w) => (
                  <li key={w.userId}>
                    <Link
                      href={`/admin/wallets/${w.userId}`}
                      className="grid grid-cols-1 items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-soft md:grid-cols-[2fr,1fr,auto] md:px-5 md:py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold tracking-tight">
                          {w.fullName}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {w.email ?? "no email"} ·{" "}
                          <span className="font-bold uppercase">{w.role}</span>
                        </p>
                      </div>
                      <p className="text-xs text-muted md:text-right">
                        {w.updatedAt
                          ? `Active ${ago(w.updatedAt)}`
                          : "No transactions"}
                      </p>
                      <p className="text-right text-base font-extrabold tracking-tight text-rajlo-red md:text-lg">
                        {formatJMD(w.balanceJmd)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              {canLoadMore && (
                <div className="border-t border-line bg-surface-soft py-3 text-center">
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
                <p className="border-t border-line bg-primary-soft px-5 py-2 text-xs font-semibold text-rajlo-red">
                  {loadMoreError}
                </p>
              )}
            </>
          )}
        </div>
      </FadeUp>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-extrabold tracking-tight md:text-2xl">
        {value}
      </p>
    </div>
  );
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
