"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { LiveIndicator } from "@/components/live-indicator";
import { useLiveQuery } from "@/lib/use-live-query";
import { formatJMD } from "@/lib/jamaica";

/**
 * /rider/wallet — rider's wallet workspace.
 *
 * Three things side by side:
 *   1. Balance hero with deposit + send-money CTAs
 *   2. Transaction history (live-polled)
 *   3. Optional inline composers for deposit + transfer
 *
 * The deposit flow redirects out to the gateway; on return the URL
 * carries `?deposit_status=` which we surface as a toast. The
 * transfer flow takes a two-step OTP confirmation entirely in-page.
 */

const PAGE_SIZE = 40;
const WALLET_URL = `/api/wallet?limit=${PAGE_SIZE}&offset=0`;

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
  /** Sum of every active hold (e.g. money reserved for an in-flight
   *  multi-leg route taxi journey). `availableJmd` = `balanceJmd` −
   *  `lockedJmd` is what the rider can actually spend right now. */
  lockedJmd?: number;
  availableJmd?: number;
  transactions: WalletTxn[];
  pagination?: { hasMore: boolean };
};

const KIND_META: Record<
  string,
  { label: string; icon: "trending-up" | "navigation" | "user" | "wallet" | "shield" | "arrow-right" | "x" }
> = {
  deposit: { label: "Deposit", icon: "wallet" },
  ride_charge: { label: "Ride", icon: "navigation" },
  ride_earning: { label: "Ride earning", icon: "trending-up" },
  withdrawal: { label: "Withdrawal", icon: "wallet" },
  withdrawal_refund: { label: "Withdrawal refund", icon: "wallet" },
  transfer_out: { label: "Sent to a rider", icon: "arrow-right" },
  transfer_in: { label: "Received from a rider", icon: "user" },
  admin_credit: { label: "Adjustment from Rajlo", icon: "shield" },
  admin_debit: { label: "Adjustment from Rajlo", icon: "shield" },
  refund: { label: "Refund", icon: "wallet" },
};

export default function RiderWalletPage() {
  const router = useRouter();

  // Pick up the redirect-back from the deposit gateway. Read once on
  // mount via a lazy initial state — `useEffect → setState` would trip
  // the react-hooks/set-state-in-effect rule.
  const [returnToast] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const status = sp.get("deposit_status");
    if (status === "completed") return "Deposit completed";
    if (status === "failed") return "Deposit failed — try again";
    if (status === "pending") return "Deposit still processing";
    return null;
  });

  const wallet = useLiveQuery<WalletResponse>(WALLET_URL, {
    interval: 15_000,
  });
  const balance = wallet.data?.balanceJmd ?? 0;
  const locked = wallet.data?.lockedJmd ?? 0;
  const available = wallet.data?.availableJmd ?? Math.max(0, balance - locked);
  // Pagination state — first page lives in `wallet` (auto-refreshed
  // every 15s); older pages loaded via "Load more" accumulate here
  // separately so the refresh doesn't wipe them.
  const [extraTxns, setExtraTxns] = useState<WalletTxn[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

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

  // Initial composer state — opens "deposit" pre-expanded when the
  // URL carries `?deposit=open`. That contract is set by the
  // InsufficientFundsDialog on the request page so a rider who
  // bounced off the wallet gate lands directly on the top-up form
  // instead of having to tap "Deposit" again. Read once via lazy
  // initial state so the first paint already shows the composer.
  const [composer, setComposer] = useState<"none" | "deposit" | "transfer">(
    () => {
      if (typeof window === "undefined") return "none";
      const sp = new URLSearchParams(window.location.search);
      return sp.get("deposit") === "open" ? "deposit" : "none";
    },
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-2 py-2 md:px-3 md:py-8">
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
              Available balance
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight md:text-5xl">
              {wallet.loading ? (
                <Skeleton variant="dark" className="h-12 w-44" rounded="lg" />
              ) : (
                formatJMD(available)
              )}
            </p>
            {locked > 0 && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-rajlo-red">
                  <Icon name="shield" className="h-2.5 w-2.5 text-white" />
                </span>
                {formatJMD(locked)} locked for an active trip
              </p>
            )}
            <p className="mt-2 text-sm text-white/75">
              Used for booking trips, sending to other riders, or receiving refunds.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setComposer((c) => (c === "deposit" ? "none" : "deposit"))
                }
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                <Icon name="plus-circle" className="h-4 w-4" />
                Deposit
              </button>
              <button
                type="button"
                onClick={() =>
                  setComposer((c) => (c === "transfer" ? "none" : "transfer"))
                }
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Icon name="arrow-right" className="h-4 w-4" />
                Send money
              </button>
              <Link
                href="/rider/qr-pay"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Icon name="credit-card" className="h-4 w-4" />
                Pay driver QR
              </Link>
            </div>
          </div>
        </div>
      </FadeUp>

      {returnToast && (
        <div className="rounded-2xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm font-semibold text-rajlo-red">
          {returnToast}
        </div>
      )}

      {composer === "deposit" && (
        <FadeUp delay={0.05}>
          <DepositComposer
            onClose={() => setComposer("none")}
            onSubmitted={(redirectUrl) => {
              // Hand off to the gateway. The user comes back via the
              // /api/wallet/deposit/callback route.
              window.location.href = redirectUrl;
            }}
          />
        </FadeUp>
      )}

      {composer === "transfer" && (
        <FadeUp delay={0.05}>
          <TransferComposer
            balance={balance}
            onClose={() => setComposer("none")}
            onCompleted={() => {
              setComposer("none");
              wallet.refresh();
            }}
          />
        </FadeUp>
      )}

      {/* Transactions */}
      <FadeUp delay={0.08}>
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              History
            </p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="text-xs font-bold text-rajlo-red hover:underline"
            >
              Refresh
            </button>
          </div>
          {wallet.loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" rounded="xl" />
              ))}
            </div>
          ) : txns.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">
              No transactions yet — top up your wallet to get started.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {txns.map((t) => (
                  <TransactionRow key={t.id} tx={t} />
                ))}
              </ul>
              {/* Load more — same dual-source rule as the driver
                 wallet: the live first-page's `hasMore` drives the
                 button until the rider has expanded once; after that
                 the loadMore response's `hasMoreOlder` takes over. */}
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
  const meta = KIND_META[tx.kind] ?? { label: tx.kind, icon: "wallet" as const };
  const isCredit = tx.direction === "credit";
  return (
    <li>
      <Link
        href={`/rider/wallet/transactions/${tx.id}`}
        className="flex w-full items-start gap-3 rounded-xl py-3 transition-colors hover:bg-surface-soft"
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            isCredit ? "bg-emerald-50 text-emerald-700" : "bg-primary-soft text-rajlo-red"
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

/* ─────────── Deposit composer ─────────── */

function DepositComposer({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: (redirectUrl: string) => void;
}) {
  const [amount, setAmount] = useState("1000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const amountJmd = parseInt(amount, 10);
    if (!Number.isInteger(amountJmd) || amountJmd < 100) {
      setError("Minimum deposit is JMD 100.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountJmd }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectUrl?: string;
      };
      if (!res.ok || !json.redirectUrl)
        throw new Error(json.error ?? `HTTP ${res.status}`);
      onSubmitted(json.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start deposit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Top up wallet
          </p>
          <p className="mt-1 text-sm font-extrabold">Deposit via WiPay</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
      <label className="mt-3 block">
        <p className="text-xs font-bold">Amount (JMD)</p>
        <input
          type="number"
          min={100}
          step={100}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base font-extrabold focus:border-rajlo-red focus:outline-none"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[500, 1000, 2000, 5000].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-bold text-muted hover:border-rajlo-red hover:text-rajlo-red"
          >
            {formatJMD(v)}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-rajlo-red">{error}</p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-60"
      >
        {submitting ? "Opening checkout…" : "Continue to payment"}
      </button>
      <p className="mt-2 text-[10px] text-muted">
        Card payment via WiPay · funds reflect instantly on success.
      </p>
    </div>
  );
}

/* ─────────── Transfer composer (two-step) ─────────── */

function TransferComposer({
  balance,
  onClose,
  onCompleted,
}: {
  balance: number;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<"enter" | "verify">("enter");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [amount, setAmount] = useState("100");
  const [message, setMessage] = useState("");
  const [transferId, setTransferId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<{ email: string; name: string | null } | null>(
    null,
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initiate = async () => {
    const amountJmd = parseInt(amount, 10);
    if (!Number.isInteger(amountJmd) || amountJmd < 50) {
      setError("Minimum transfer is JMD 50.");
      return;
    }
    if (amountJmd > balance) {
      setError(`You only have ${formatJMD(balance)} available.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail,
          amountJmd,
          message,
          otpMethod: "email",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        transferId?: string;
        recipient?: { email: string; name: string | null };
        sentTo?: string;
      };
      if (!res.ok || !json.transferId)
        throw new Error(json.error ?? `HTTP ${res.status}`);
      setTransferId(json.transferId);
      setRecipient(json.recipient ?? null);
      setSentTo(json.sentTo ?? null);
      setStep("verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!transferId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/wallet/transfer/${transferId}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSuccess(true);
      setTimeout(onCompleted, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!transferId) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/wallet/transfer/${transferId}/cancel`, {
        method: "POST",
      });
    } finally {
      onCompleted();
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white">
          <Icon name="check-circle" className="h-5 w-5" />
        </span>
        <p className="mt-3 text-base font-extrabold tracking-tight">Sent!</p>
        <p className="mt-1 text-xs text-emerald-900/80">
          {recipient?.name ?? recipient?.email} just received{" "}
          {formatJMD(parseInt(amount, 10))}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rajlo-red/30 bg-primary-soft/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Send money
          </p>
          <p className="mt-1 text-sm font-extrabold">
            {step === "enter" ? "Pick a recipient" : "Confirm with code"}
          </p>
        </div>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white disabled:opacity-50"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>

      {step === "enter" ? (
        <div className="mt-3 space-y-3">
          <Field label="Recipient email">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="rider@example.com"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
            />
          </Field>
          <Field label="Amount (JMD)">
            <input
              type="number"
              min={50}
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base font-extrabold focus:border-rajlo-red focus:outline-none"
            />
          </Field>
          <Field label="Note (optional)">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's it for?"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
            />
          </Field>
          {error && (
            <p className="text-xs font-semibold text-rajlo-red">{error}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>
              We&apos;ll email you a 6-digit code. SMS is{" "}
              <span className="font-semibold">coming soon</span>.
            </span>
            <button
              type="button"
              onClick={initiate}
              disabled={busy || !recipientEmail || !amount}
              className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-5 py-2 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "Sending code…" : "Send code"}
              {!busy && <Icon name="arrow-right" className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="rounded-xl border border-line bg-surface p-3 text-xs">
            Sending{" "}
            <span className="font-extrabold">{formatJMD(parseInt(amount, 10))}</span> to{" "}
            <span className="font-extrabold">{recipient?.name ?? recipient?.email}</span>.
            Code sent to <span className="font-extrabold">{sentTo}</span>.
          </p>
          <Field label="6-digit code">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-center text-2xl font-extrabold tracking-[0.4em] focus:border-rajlo-red focus:outline-none"
            />
          </Field>
          {error && (
            <p className="text-xs font-semibold text-rajlo-red">{error}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold hover:bg-surface-soft disabled:opacity-50"
            >
              Cancel transfer
            </button>
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.length < 4}
              className="inline-flex items-center gap-1.5 rounded-full bg-rajlo-red px-5 py-2 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Send money"}
              {!busy && <Icon name="check-circle" className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
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
