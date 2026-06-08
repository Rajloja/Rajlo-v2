"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { formatJMD } from "@/lib/jamaica";

/**
 * /admin/payouts — driver payout queue (Friday-batch workflow).
 *
 * Four tabs map to the lifecycle:
 *   Pending  → OTP-verified payouts waiting to be batched.
 *   Batched  → in a downloaded CSV, waiting on the bank.
 *   Paid     → confirmed by the bank, driver notified.
 *   Excluded → admin opted out (refunded to driver wallet).
 *
 * Workflow:
 *   1. On Pending: tick rows + "Download batch CSV" → server marks
 *      them 'batched', the browser receives the CSV file. Admin
 *      submits the CSV to the bank.
 *   2. On Batched: tick rows + enter bank reference + "Mark as paid"
 *      → server flips to 'paid', fires push + inbox + email to each
 *      affected driver.
 *   3. Per-row "Exclude" opens a modal for reason + optional custom
 *      email body. Refunds the wallet and notifies the driver.
 *
 * No background polling — admin actions are deliberate, not real-
 * time, and the rate of new pending payouts is low.
 */

type Payout = {
  id: string;
  userId: string;
  driverExternalId: string | null;
  driverTrn: string | null;
  driverName: string;
  driverEmail: string | null;
  amountJmd: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  accountHolderName: string | null;
  methodSnapshot: {
    branch?: string;
    account_type?: string;
    routing_number?: string;
  } | null;
  status:
    | "pending"
    | "batched"
    | "paid"
    | "excluded"
    | "cancelled"
    | "processing"
    | "rejected";
  adminNote: string | null;
  otpVerifiedAt: string | null;
  batchedAt: string | null;
  batchId: string | null;
  paidAt: string | null;
  excludedAt: string | null;
  excludedReason: string | null;
  excludedEmailSentAt: string | null;
  bankReference: string | null;
  createdAt: string;
};

type StatusFilter = "pending" | "batched" | "paid" | "excluded" | "all";

const TABS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "batched", label: "In batch" },
  { id: "paid", label: "Paid" },
  { id: "excluded", label: "Excluded" },
  { id: "all", label: "All" },
];

export default function AdminPayoutsPage() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState("");
  const [excludeTarget, setExcludeTarget] = useState<Payout | null>(null);

  const refresh = async () => {
    setPayouts(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/admin/payouts?status=${filter}`);
      const json = (await res.json().catch(() => ({}))) as {
        payouts?: Payout[];
      };
      setPayouts(json.payouts ?? []);
    } catch {
      setPayouts([]);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const totalSelected = useMemo(
    () =>
      (payouts ?? [])
        .filter((p) => selected.has(p.id))
        .reduce((sum, p) => sum + p.amountJmd, 0),
    [payouts, selected],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (!payouts) return;
    if (selected.size === payouts.length) setSelected(new Set());
    else setSelected(new Set(payouts.map((p) => p.id)));
  };

  const downloadBatch = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payouts/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Server returns text/csv. Trigger a download in the browser.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] ?? "rajlo-payouts.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setInfo(`Batch CSV downloaded · ${selected.size} payouts marked as batched.`);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't download batch.");
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payouts/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          bankReference: bankRef || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        paidCount?: number;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setInfo(`Marked ${json.paidCount ?? selected.size} payouts as paid. Drivers notified.`);
      setBankRef("");
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark paid.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-2 md:px-3 md:py-8">
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={360}
            variant="red"
            className="absolute -right-20 -bottom-24 opacity-[0.18]"
          />
          <div className="relative">
            <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Admin · payouts
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              Driver payout queue
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/75">
              OTP-verified driver withdrawals waiting to be batched, sent to
              the bank, or marked paid. Drivers see status updates instantly
              via push + email.
            </p>
          </div>
        </div>
      </FadeUp>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
              filter === t.id
                ? "border-rajlo-red bg-primary-soft text-rajlo-red"
                : "border-line bg-surface text-muted hover:bg-surface-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
        <Link
          href="/admin"
          className="ml-auto text-xs font-bold text-muted hover:text-rajlo-red"
        >
          ← Admin home
        </Link>
      </div>

      {error && (
        <p className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-2 text-xs font-semibold text-rajlo-red">
          {error}
        </p>
      )}
      {info && !error && (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {info}
        </p>
      )}

      {(filter === "pending" || filter === "batched") && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-bold text-muted hover:text-rajlo-red"
          >
            {payouts && selected.size === payouts.length && payouts.length > 0
              ? "Unselect all"
              : "Select all"}
          </button>
          <p className="text-sm font-bold">
            {selected.size} selected · {formatJMD(totalSelected)}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {filter === "batched" && selected.size > 0 && (
              <input
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                placeholder="Bank reference (optional)"
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs focus:border-rajlo-red focus:outline-none"
              />
            )}
            {filter === "pending" && (
              <button
                type="button"
                onClick={downloadBatch}
                disabled={busy || selected.size === 0}
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary-hover disabled:opacity-50"
              >
                <Icon name="arrow-right" className="h-3.5 w-3.5" />
                {busy ? "Working…" : `Download batch CSV (${selected.size})`}
              </button>
            )}
            {filter === "batched" && (
              <button
                type="button"
                onClick={markPaid}
                disabled={busy || selected.size === 0}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                <Icon name="check-circle" className="h-3.5 w-3.5" />
                {busy ? "Working…" : `Mark paid (${selected.size})`}
              </button>
            )}
          </div>
        </div>
      )}

      {payouts === null ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : payouts.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center text-sm text-muted">
          No payouts in this view.
        </div>
      ) : (
        <FadeUp delay={0.05}>
          <div className="overflow-hidden rounded-3xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-soft text-[10px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">Bank</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Requested</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      {(p.status === "pending" || p.status === "batched") && (
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          className="h-4 w-4 accent-rajlo-red"
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold">{p.driverName}</p>
                      <p className="text-[11px] text-muted">
                        {p.driverExternalId ?? "—"} ·{" "}
                        {p.driverEmail ?? "no email"}
                      </p>
                      {p.driverTrn && (
                        <p className="text-[11px] text-muted">
                          TRN {p.driverTrn}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-bold">
                        {p.bankName ?? "—"} ·{" "}
                        {p.methodSnapshot?.branch ?? ""}
                      </p>
                      <p className="text-muted">
                        {p.accountHolderName ?? ""}
                      </p>
                      <p className="text-muted">
                        ••{(p.bankAccountNumber ?? "").slice(-4)} ·{" "}
                        {p.methodSnapshot?.account_type ?? ""}
                      </p>
                      {p.methodSnapshot?.routing_number && (
                        <p className="text-[11px] text-muted">
                          Routing {p.methodSnapshot.routing_number}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-extrabold">
                      {formatJMD(p.amountJmd)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={p.status} />
                      {p.excludedReason && (
                        <p className="mt-1 max-w-xs truncate text-[11px] text-muted">
                          {p.excludedReason}
                        </p>
                      )}
                      {p.bankReference && (
                        <p className="mt-1 text-[11px] text-muted">
                          Ref {p.bankReference}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-muted">
                      {new Date(p.createdAt).toLocaleString("en-JM", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {p.otpVerifiedAt && (
                        <p>OTP at {new Date(p.otpVerifiedAt).toLocaleTimeString("en-JM")}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {(p.status === "pending" || p.status === "batched") && (
                        <button
                          type="button"
                          onClick={() => setExcludeTarget(p)}
                          className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-bold text-muted hover:border-amber-500 hover:text-amber-700"
                        >
                          Exclude
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeUp>
      )}

      {excludeTarget && (
        <ExcludeDialog
          payout={excludeTarget}
          onClose={() => setExcludeTarget(null)}
          onDone={() => {
            setExcludeTarget(null);
            setInfo(`Excluded ${excludeTarget.driverName}. Wallet refunded.`);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Payout["status"] }) {
  const tone =
    status === "paid"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : status === "batched"
      ? "bg-blue-100 text-blue-800 border-blue-300"
      : status === "excluded"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : status === "cancelled" || status === "rejected"
      ? "bg-primary-soft text-rajlo-red border-rajlo-red/30"
      : "bg-amber-50 text-amber-800 border-amber-300";
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${tone}`}
    >
      {status}
    </span>
  );
}

function ExcludeDialog({
  payout,
  onClose,
  onDone,
}: {
  payout: Payout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setError("Give a reason — it's the audit trail.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/payouts/${payout.id}/exclude`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            customMessage: customMessage.trim() || undefined,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't exclude.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-rajlo-black/50 p-4 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-lg space-y-4 rounded-3xl bg-surface p-5 shadow-2xl md:p-6">
        <div>
          <p className="font-secondary text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
            Exclude payout
          </p>
          <h2 className="mt-1 text-xl font-extrabold">
            Hold {payout.driverName}'s {formatJMD(payout.amountJmd)}
          </h2>
          <p className="mt-1 text-xs text-muted">
            The wallet will be auto-refunded and the driver gets a push + email
            notification. The reason is internal audit only unless you write a
            custom message below.
          </p>
        </div>

        <label className="block text-sm">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">
            Reason (internal)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Account number mismatch with bank records"
            className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">
            Custom message for the driver (optional)
          </span>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={4}
            placeholder="Leave blank to use the default. e.g.: We couldn't credit your bank because the account number we have on file doesn't match. Please update it under Wallet → Bank account."
            className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
          />
        </label>

        {error && (
          <p className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-2 text-xs font-semibold text-rajlo-red">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-muted hover:bg-surface-soft disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-amber-600 px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Working…" : "Exclude + refund + notify"}
          </button>
        </div>
      </div>
    </div>
  );
}
