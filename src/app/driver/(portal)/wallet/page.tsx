"use client";

import Link from "next/link";
import { useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";
import { getCachedDriverData } from "@/lib/driver-prefetch";

const PAGE_SIZE = 40;
const WALLET_URL = `/api/wallet?limit=${PAGE_SIZE}&offset=0`;
const WITHDRAWALS_URL = "/api/wallet/withdraw";

/**
 * /driver/wallet — driver's wallet workspace.
 *
 * Three sections:
 *   1. Hero with current balance + total earnings (lifetime sum of
 *      ride_earning credits) + a "Withdraw to bank" CTA
 *   2. Inline withdrawal composer (collapses by default)
 *   3. Transactions + withdrawals history side by side
 */

type WalletTxn = {
  id: string;
  direction: "credit" | "debit";
  amount_jmd: number;
  kind: string;
  description: string | null;
  balance_after_jmd: number;
  created_at: string;
};

type WalletResponse = {
  balanceJmd: number;
  transactions: WalletTxn[];
  pagination?: { hasMore: boolean };
};

type WithdrawalsResponse = {
  withdrawals: Array<{
    id: string;
    amount_jmd: number;
    bank_name: string | null;
    bank_account_number: string | null;
    account_holder_name: string | null;
    status: "pending" | "processing" | "paid" | "rejected" | "cancelled";
    admin_note: string | null;
    reviewed_at: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
};

const KIND_META: Record<
  string,
  {
    label: string;
    icon: "trending-up" | "navigation" | "user" | "wallet" | "shield" | "x";
  }
> = {
  ride_earning: { label: "Ride earning", icon: "trending-up" },
  ride_charge: { label: "Ride", icon: "navigation" },
  withdrawal: { label: "Withdrawal", icon: "wallet" },
  withdrawal_refund: { label: "Withdrawal refund", icon: "wallet" },
  admin_credit: { label: "Adjustment from Rajlo", icon: "shield" },
  admin_debit: { label: "Adjustment from Rajlo", icon: "shield" },
  refund: { label: "Refund", icon: "wallet" },
  deposit: { label: "Deposit", icon: "wallet" },
  transfer_out: { label: "Sent to a rider", icon: "user" },
  transfer_in: { label: "Received from a rider", icon: "user" },
};

export default function DriverWalletPage() {
  // Seed both queries from the bottom-nav prefetch cache so opening
  // the Wallet drawer item renders the real balance + ledger
  // instantly. The live-query keeps re-fetching on its interval so
  // values stay current; `refreshing` shows the freshness state.
  const wallet = useLiveQuery<WalletResponse>(WALLET_URL, {
    interval: 15_000,
    initialData: getCachedDriverData<WalletResponse>(WALLET_URL),
  });
  const withdrawals = useLiveQuery<WithdrawalsResponse>(WITHDRAWALS_URL, {
    interval: 30_000,
    initialData: getCachedDriverData<WithdrawalsResponse>(WITHDRAWALS_URL),
  });
  const balance = wallet.data?.balanceJmd ?? 0;
  // Pagination state — `useLiveQuery` owns the first page (and
  // refreshes it on its interval). Older pages loaded via "Load more"
  // live here separately so the auto-refresh doesn't wipe them.
  const [extraTxns, setExtraTxns] = useState<WalletTxn[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Merge first-page (live) + older accumulated pages, dedupe by id
  // in case a refresh shifts a row that was the boundary into the
  // older list.
  const firstPage = wallet.data?.transactions ?? [];
  const firstPageIds = new Set(firstPage.map((t) => t.id));
  const txns: WalletTxn[] = [
    ...firstPage,
    ...extraTxns.filter((t) => !firstPageIds.has(t.id)),
  ];

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(
        `/api/wallet?limit=${PAGE_SIZE}&offset=${txns.length}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WalletResponse;
      setExtraTxns((prev) => {
        const seen = new Set([
          ...firstPage.map((t) => t.id),
          ...prev.map((t) => t.id),
        ]);
        const incoming = json.transactions.filter((t) => !seen.has(t.id));
        return [...prev, ...incoming];
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

  const lifetimeEarned = txns
    .filter((t) => t.kind === "ride_earning" && t.direction === "credit")
    .reduce((s, t) => s + t.amount_jmd, 0);

  const [showWithdraw, setShowWithdraw] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-2 md:px-3 md:py-8">
      {/* Hero */}
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-7 text-white shadow-xl md:p-9">
          <ArcWatermark
            size={460}
            variant="red"
            className="absolute -right-20 -bottom-20 opacity-[0.12]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
                Wallet
              </p>
              <LiveIndicator
                variant="dark"
                lastUpdated={wallet.lastUpdated}
                refreshing={wallet.refreshing}
                onRefresh={wallet.refresh}
              />
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-white/55">
              Available to withdraw
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">
              {wallet.loading ? (
                <Skeleton variant="dark" className="h-12 w-44" rounded="lg" />
              ) : (
                formatJMD(balance)
              )}
            </p>
            <p className="mt-2 text-sm text-white/75">
              Lifetime ride earnings on these last 40 transactions:{" "}
              <span className="font-extrabold">
                {formatJMD(lifetimeEarned)}
              </span>
              .
            </p>
            <button
              type="button"
              onClick={() => setShowWithdraw((v) => !v)}
              disabled={balance < 500}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="wallet" className="h-4 w-4" />
              {showWithdraw ? "Hide form" : "Withdraw to bank"}
            </button>
            {balance < 500 && (
              <p className="mt-2 text-[11px] text-white/60">
                Minimum withdrawal is JMD 500.
              </p>
            )}
          </div>
        </div>
      </FadeUp>

      {showWithdraw && (
        <FadeUp delay={0.05}>
          <WithdrawComposer
            balance={balance}
            onClose={() => setShowWithdraw(false)}
            onSubmitted={() => {
              setShowWithdraw(false);
              wallet.refresh();
              withdrawals.refresh();
            }}
          />
        </FadeUp>
      )}

      {/* Pending withdrawals */}
      {(withdrawals.data?.withdrawals.length ?? 0) > 0 && (
        <FadeUp delay={0.06}>
          <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Withdrawals
            </p>
            <ul className="mt-3 space-y-2">
              {(withdrawals.data?.withdrawals ?? []).map((w) => (
                <WithdrawalRow
                  key={w.id}
                  w={w}
                  onCancelled={() => {
                    wallet.refresh();
                    withdrawals.refresh();
                  }}
                />
              ))}
            </ul>
          </div>
        </FadeUp>
      )}

      {/* Transactions */}
      <FadeUp delay={0.08}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            History
          </p>
          {wallet.loading ? (
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" rounded="xl" />
              ))}
            </div>
          ) : txns.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">
              No transactions yet — complete a trip to see earnings here.
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-line">
                {txns.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
              {/* Load more — use the live first-page's hasMore until
                 the driver has expanded once; after that the stored
                 hasMoreOlder (from the last loadMore response) takes
                 over. */}
              {(extraTxns.length === 0
                ? (wallet.data?.pagination?.hasMore ?? false)
                : hasMoreOlder) && (
                <div className="mt-4 text-center">
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
                <p className="mt-2 text-center text-[11px] font-semibold text-rajlo-red">
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

/* ─────────── Transaction row ─────────── */

function TransactionRow({
  tx,
}: {
  tx: WalletResponse["transactions"][number];
}) {
  const meta = KIND_META[tx.kind] ?? {
    label: tx.kind,
    icon: "wallet" as const,
  };
  const isCredit = tx.direction === "credit";
  return (
    <li>
      <Link
        href={`/driver/wallet/transactions/${tx.id}`}
        className="flex items-start gap-3 rounded-xl py-3 transition-colors hover:bg-surface-soft"
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            isCredit
              ? "bg-emerald-50 text-emerald-700"
              : "bg-primary-soft text-rajlo-red"
          }`}
        >
          <Icon name={meta.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold tracking-tight">
            {meta.label}
          </p>
          <p className="truncate text-xs text-muted">
            {tx.description || ago(tx.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p
            className={`text-sm font-extrabold tracking-tight ${
              isCredit ? "text-emerald-700" : "text-rajlo-red"
            }`}
          >
            {isCredit ? "+" : "−"}
            {formatJMD(tx.amount_jmd)}
          </p>
          <p className="text-[10px] font-semibold text-muted">
            Bal · {formatJMD(tx.balance_after_jmd)}
          </p>
        </div>
      </Link>
    </li>
  );
}

/* ─────────── Withdrawal row ─────────── */

function WithdrawalRow({
  w,
  onCancelled,
}: {
  w: WithdrawalsResponse["withdrawals"][number];
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (!confirm(`Cancel this withdrawal? The amount returns to your wallet.`))
      return;
    setBusy(true);
    try {
      await fetch(`/api/wallet/withdraw/${w.id}`, { method: "DELETE" });
      onCancelled();
    } finally {
      setBusy(false);
    }
  };
  const tone =
    w.status === "paid"
      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
      : w.status === "rejected" || w.status === "cancelled"
      ? "bg-primary-soft text-rajlo-red border-rajlo-red/30"
      : "bg-amber-50 text-amber-800 border-amber-300";
  return (
    <li className="rounded-xl border border-line bg-surface-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-tight">
            {formatJMD(w.amount_jmd)} · {w.bank_name ?? "Bank transfer"}
          </p>
          <p className="truncate text-[11px] text-muted">
            {w.account_holder_name ?? ""} · {ago(w.created_at)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${tone}`}
        >
          {w.status}
        </span>
      </div>
      {w.admin_note && (
        <p className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-muted">
          {w.admin_note}
        </p>
      )}
      {w.status === "pending" && (
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-[11px] font-bold text-muted hover:border-rajlo-red hover:text-rajlo-red disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </li>
  );
}

/* ─────────── Withdraw composer ─────────── */

function WithdrawComposer({
  balance,
  onClose,
  onSubmitted,
}: {
  balance: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const amountJmd = parseInt(amount, 10);
    if (!Number.isInteger(amountJmd) || amountJmd < 500) {
      setError("Minimum withdrawal is JMD 500.");
      return;
    }
    if (amountJmd > balance) {
      setError(`You only have ${formatJMD(balance)} available.`);
      return;
    }
    if (!bankName || !accountNumber || !holder) {
      setError("Fill in every bank field.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountJmd,
          bankName,
          bankAccountNumber: accountNumber,
          accountHolderName: holder,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Withdraw
          </p>
          <p className="mt-1 text-sm font-extrabold">Send to your bank</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Amount (JMD)">
          <input
            type="number"
            min={500}
            max={balance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base font-extrabold focus:border-rajlo-red focus:outline-none"
          />
        </Field>
        <Field label="Bank">
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. NCB, Scotiabank"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </Field>
        <Field label="Account number">
          <input
            value={accountNumber}
            onChange={(e) =>
              setAccountNumber(e.target.value.replace(/[^0-9-]/g, ""))
            }
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </Field>
        <Field label="Account holder name">
          <input
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Funds leave your wallet immediately; the bank transfer is sent manually
        by Rajlo within 1 business day. Cancel to refund anytime before
        processing starts.
      </p>
      {error && (
        <p className="mt-2 text-xs font-semibold text-rajlo-red">{error}</p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "Submitting…" : "Request withdrawal"}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="text-xs font-bold">{label}</p>
      <div className="mt-1">{children}</div>
    </label>
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
