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
 * /admin/wallet-withdrawals — driver payout queue.
 *
 * Filters by status. Each row exposes three actions: mark
 * processing, mark paid, reject. The "paid" status is the one that
 * actually settles the money in the world (Rajlo ops sends the bank
 * transfer); the wallet was already debited at request time so no
 * money moves on a "paid" click — it just records the date.
 *
 * "Reject" refunds the held amount via the wallet helper.
 */

type Withdrawal = {
  id: string;
  userId: string;
  driverExternalId: string | null;
  driverName: string;
  amountJmd: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  accountHolderName: string | null;
  status:
    | "pending"
    | "processing"
    | "paid"
    | "rejected"
    | "cancelled";
  adminNote: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

type StatusFilter =
  | "pending"
  | "processing"
  | "paid"
  | "rejected"
  | "cancelled"
  | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const PAGE_SIZE = 100;

export default function AdminWithdrawalsPage() {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const url = `/api/admin/wallet-withdrawals?status=${status}&limit=${PAGE_SIZE}&offset=0`;
  const query = useLiveQuery<{
    withdrawals: Withdrawal[];
    pagination?: { hasMore: boolean };
  }>(url, { interval: 20_000 });

  const [extra, setExtra] = useState<Withdrawal[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setHasMoreOlder(true);
    setLoadMoreError(null);
  }, [url]);

  const firstPage = query.data?.withdrawals ?? [];
  const firstIds = new Set(firstPage.map((w) => w.id));
  const list: Withdrawal[] = [
    ...firstPage,
    ...extra.filter((w) => !firstIds.has(w.id)),
  ];
  const canLoadMore =
    extra.length === 0
      ? (query.data?.pagination?.hasMore ?? false)
      : hasMoreOlder;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = new URL(url, window.location.origin);
      next.searchParams.set("offset", String(list.length));
      const res = await fetch(next.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        withdrawals: Withdrawal[];
        pagination?: { hasMore: boolean };
      };
      setExtra((prev) => {
        const seen = new Set([
          ...firstPage.map((w) => w.id),
          ...prev.map((w) => w.id),
        ]);
        return [...prev, ...json.withdrawals.filter((w) => !seen.has(w.id))];
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
    <div className="mx-auto max-w-5xl space-y-5 px-2 py-4 md:px-3 md:py-8">
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-9">
          <ArcWatermark
            size={420}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.10]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Payouts
              </p>
              <LiveIndicator
                variant="dark"
                lastUpdated={query.lastUpdated}
                refreshing={query.refreshing}
                onRefresh={query.refresh}
              />
            </div>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              Withdrawal queue
            </h1>
            <p className="mt-1 text-sm text-white/70 md:text-base">
              Drivers withdrawing wallet earnings to their bank. Mark as paid
              once you&apos;ve sent the transfer.
            </p>
          </div>
        </div>
      </FadeUp>

      <FadeUp delay={0.04}>
        <div className="-mx-2 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full border border-line bg-surface-soft p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  status === f.key
                    ? "bg-rajlo-red text-white shadow-md shadow-rajlo-red/30"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </FadeUp>

      {query.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" rounded="2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface-soft p-12 text-center">
          <Icon name="check-circle" className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 text-sm font-bold">Nothing in this queue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((w) => (
            <WithdrawalRow key={w.id} w={w} onAction={() => query.refresh()} />
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

function WithdrawalRow({
  w,
  onAction,
}: {
  w: Withdrawal;
  onAction: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"processing" | "paid" | "rejected" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const act = async (decision: "processing" | "paid" | "rejected") => {
    if (decision === "rejected" && !note.trim()) {
      setError("Add a note explaining the rejection — it shows on the driver's wallet.");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/admin/wallet-withdrawals/${w.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const tone =
    w.status === "paid"
      ? "border-emerald-300 bg-emerald-50/50"
      : w.status === "rejected" || w.status === "cancelled"
        ? "border-rajlo-red/30 bg-primary-soft/40"
        : "border-line bg-surface";

  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/wallets/${w.userId}`}
            className="text-sm font-extrabold tracking-tight hover:text-rajlo-red"
          >
            {w.driverName}
            {w.driverExternalId && (
              <span className="text-muted"> · {w.driverExternalId}</span>
            )}
          </Link>
          <p className="text-[11px] text-muted">
            Requested {ago(w.createdAt)}
          </p>
        </div>
        <p className="text-2xl font-extrabold tracking-tight text-rajlo-red">
          {formatJMD(w.amountJmd)}
        </p>
      </div>
      <div className="mt-3 grid gap-2 rounded-xl bg-white p-3 text-xs sm:grid-cols-3">
        <Detail label="Bank" value={w.bankName} />
        <Detail label="Account" value={w.bankAccountNumber} />
        <Detail label="Holder" value={w.accountHolderName} />
      </div>
      {w.adminNote && (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] text-muted">
          Admin note · {w.adminNote}
        </p>
      )}
      {(w.status === "pending" || w.status === "processing") && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (required for reject)"
            className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-xs focus:border-rajlo-red focus:outline-none"
          />
          {error && (
            <p className="text-xs font-semibold text-rajlo-red">{error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {w.status === "pending" && (
              <button
                type="button"
                onClick={() => act("processing")}
                disabled={busy !== null}
                className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-extrabold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {busy === "processing" ? "Marking…" : "Mark processing"}
              </button>
            )}
            <button
              type="button"
              onClick={() => act("paid")}
              disabled={busy !== null}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-white shadow-md hover:-translate-y-0.5 disabled:opacity-50"
            >
              {busy === "paid" ? "Marking…" : "Mark paid"}
            </button>
            <button
              type="button"
              onClick={() => act("rejected")}
              disabled={busy !== null}
              className="rounded-full border border-rajlo-red/30 bg-primary-soft px-4 py-2 text-xs font-extrabold text-rajlo-red hover:bg-rajlo-red hover:text-white disabled:opacity-50"
            >
              {busy === "rejected" ? "Rejecting…" : "Reject + refund"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 truncate font-bold">{value ?? "—"}</p>
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
