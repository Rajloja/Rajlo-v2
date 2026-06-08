"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArcWatermark } from "@/components/arc-pattern";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";

/**
 * /driver/wallet/bank — manage the driver's saved Jamaican bank
 * account for payouts.
 *
 * One method per driver. The form is GET-prefilled with whatever is
 * currently saved (or blank on first visit). PUT upserts.
 *
 * Snapshot rule: when the driver edits this AFTER a payout has been
 * requested but before the bank batch goes out, the in-flight row
 * keeps its own snapshot (taken at request time). New requests pick
 * up the freshly-edited details.
 */

type Method = {
  id: string;
  bank_name: string;
  branch: string;
  account_number: string;
  account_holder_name: string;
  account_type: "savings" | "chequing";
  routing_number: string | null;
  updated_at: string;
};

export default function DriverBankPage() {
  const [method, setMethod] = useState<Method | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Form state — separate from `method` so editing doesn't optimistically
  // overwrite the loaded copy until the save succeeds.
  const [bankName, setBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountType, setAccountType] =
    useState<"savings" | "chequing">("savings");
  const [routingNumber, setRoutingNumber] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/driver/payout-method");
        const json = (await res.json().catch(() => ({}))) as {
          method?: Method | null;
        };
        if (cancelled) return;
        const m = json.method ?? null;
        setMethod(m);
        if (m) {
          setBankName(m.bank_name);
          setBranch(m.branch);
          setAccountNumber(m.account_number);
          setAccountHolder(m.account_holder_name);
          setAccountType(m.account_type);
          setRoutingNumber(m.routing_number ?? "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setError(null);
    if (!bankName.trim() || !branch.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      setError("Bank name, branch, account number, and account holder name are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/driver/payout-method", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: bankName.trim(),
          branch: branch.trim(),
          accountNumber: accountNumber.trim(),
          accountHolderName: accountHolder.trim(),
          accountType,
          routingNumber: routingNumber.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      // Refresh the loaded method so the "updated X ago" line ticks.
      const refreshed = await fetch("/api/driver/payout-method");
      const data = (await refreshed.json().catch(() => ({}))) as {
        method?: Method | null;
      };
      setMethod(data.method ?? null);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save bank details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2 md:px-3 md:py-8">
      <FadeUp>
        <div className="relative overflow-hidden rounded-3xl bg-rajlo-black p-6 text-white shadow-xl shadow-rajlo-black/30 md:p-8">
          <ArcWatermark
            size={320}
            variant="red"
            className="absolute -right-20 -bottom-24 opacity-[0.18]"
          />
          <div className="relative">
            <Link
              href="/driver/wallet"
              className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white"
            >
              <Icon name="chevron-left" className="h-3.5 w-3.5" />
              Back to wallet
            </Link>
            <p className="mt-3 font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
              Bank account
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl">
              Where do we send your payouts?
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/75">
              Save the Jamaican bank account we'll credit when you request a
              payout. You can edit this anytime — in-flight payouts keep the
              details they had when you requested them.
            </p>
          </div>
        </div>
      </FadeUp>

      {loading ? (
        <Skeleton className="h-72 rounded-3xl" />
      ) : (
        <FadeUp delay={0.05}>
          <div className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-sm md:p-6">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Bank">
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. NCB, Scotiabank, JN Bank"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
                />
              </Field>
              <Field label="Branch">
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. New Kingston"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
                />
              </Field>
              <Field label="Account number">
                <input
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/[^0-9\- ]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
                />
              </Field>
              <Field label="Account holder name">
                <input
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="As it appears on your bank statement"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
                />
              </Field>
              <Field label="Account type">
                <div className="flex gap-2">
                  {(["savings", "chequing"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAccountType(t)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold capitalize transition-colors ${
                        accountType === t
                          ? "border-rajlo-red bg-primary-soft text-rajlo-red"
                          : "border-line bg-surface text-muted hover:bg-surface-soft"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Routing / transit number" hint="Optional — fill in if your bank requires it">
                <input
                  value={routingNumber}
                  onChange={(e) =>
                    setRoutingNumber(e.target.value.replace(/[^0-9\- ]/g, ""))
                  }
                  inputMode="numeric"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm focus:border-rajlo-red focus:outline-none"
                />
              </Field>
            </div>

            {error && (
              <p className="rounded-xl border border-rajlo-red/30 bg-primary-soft px-4 py-2 text-xs font-semibold text-rajlo-red">
                {error}
              </p>
            )}
            {savedAt && !error && (
              <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
                Saved. You can request a payout anytime.
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted">
                {method
                  ? `Last updated ${new Date(method.updated_at).toLocaleString("en-JM")}`
                  : "First time saving your bank details."}
              </p>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-md hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Icon name="check-circle" className="h-4 w-4" />
                    {method ? "Save changes" : "Save bank account"}
                  </>
                )}
              </button>
            </div>
          </div>
        </FadeUp>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      {hint && (
        <span className="block text-[10px] text-muted/80">{hint}</span>
      )}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
