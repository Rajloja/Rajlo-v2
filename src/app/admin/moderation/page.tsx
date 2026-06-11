"use client";

import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { useLiveQuery } from "@/lib/use-live-query";
import { AdminPromptDialog } from "@/components/admin-prompt-dialog";

/**
 * /admin/moderation — enforcement console.
 *
 * Shows the active driver payout holds (with a release control) and
 * the recent enforcement-action log. Enforcement actions on a specific
 * user are taken from that user's fraud profile (/admin/fraud/[userId])
 * — this page is the platform-wide moderation overview.
 */

type Action = {
  id: string;
  admin: string;
  targetUserId: string;
  targetName: string;
  actionType: string;
  reason: string | null;
  createdAt: string;
};
type Hold = {
  id: string;
  driverUserId: string;
  driverName: string;
  reason: string;
  holdAmount: number | null;
  createdBy: string;
  createdAt: string;
};
type Payload = {
  recentActions: Action[];
  activeHolds: Hold[];
  pagination?: { hasMoreActions: boolean; hasMoreHolds: boolean };
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_LABEL: Record<string, string> = {
  warning: "Warning",
  temporary_suspension: "Temp. suspension",
  permanent_ban: "Permanent ban",
  reinstatement: "Reinstatement",
  payout_hold: "Payout hold",
  payout_hold_released: "Payout hold released",
  trip_restriction: "Trip restriction",
  payment_restriction: "Payment restriction",
  reverification_required: "Re-verification required",
};

export default function AdminModerationPage() {
  const query = useLiveQuery<Payload>("/api/admin/moderation", {
    interval: 30_000,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Active release-hold confirmation. Holds the target hold so the
  // dialog knows whose hold to release on confirm.
  const [releaseTarget, setReleaseTarget] = useState<Hold | null>(null);
  const data = query.data;

  const releaseHold = async (driverUserId: string) => {
    setBusyId(driverUserId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/moderation/${driverUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_payout_hold" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await query.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-2 py-2 md:px-3 md:py-8">
      <div className="mb-6">
        <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
          Moderation
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          Enforcement console
        </h1>
        <p className="mt-2 text-sm text-muted">
          Active payout holds and the platform-wide enforcement log. To
          act on a specific account, open it from Fraud &amp; risk.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
          {error}
        </p>
      )}

      {/* ── Active payout holds ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Active payout holds
        </h2>
        {query.loading ? (
          <Skeleton className="h-24 w-full" rounded="lg" />
        ) : (data?.activeHolds ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No payout holds in place.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.activeHolds.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">
                      {h.driverName}
                    </p>
                    <p className="mt-1 text-xs text-muted">{h.reason}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      By {h.createdBy} · {timeAgo(h.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === h.driverUserId}
                      onClick={() => setReleaseTarget(h)}
                      className="rounded-full border border-line bg-background px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
                    >
                      Release
                    </button>
                    {/* Explicit, labelled "open in fraud" link instead
                       of a whole-row link — the user's complaint was
                       that clicking moderation rows felt like a loop
                       back to fraud. Now the row is informational and
                       the navigation is a deliberate opt-in. */}
                    <Link
                      href={`/admin/fraud/${h.driverUserId}`}
                      className="text-[11px] font-bold text-rajlo-red hover:underline"
                    >
                      View profile →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
            {data?.pagination?.hasMoreHolds && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                More active holds not shown — release some to surface the
                next batch.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* ── Enforcement log ── */}
      <section>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
          Recent enforcement actions
        </h2>
        {query.loading ? (
          <Skeleton className="h-40 w-full" rounded="lg" />
        ) : (data?.recentActions ?? []).length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No enforcement actions recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.recentActions.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-line bg-surface p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{a.targetName}</p>
                    <p className="mt-1 text-xs font-semibold text-rajlo-red">
                      {ACTION_LABEL[a.actionType] ?? a.actionType}
                    </p>
                    {a.reason && (
                      <p className="mt-0.5 text-xs text-muted">{a.reason}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted">
                      by {a.admin} · {timeAgo(a.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/fraud/${a.targetUserId}`}
                    className="shrink-0 text-[11px] font-bold text-rajlo-red hover:underline"
                  >
                    View profile →
                  </Link>
                </div>
              </li>
            ))}
            {data?.pagination?.hasMoreActions && (
              <li className="px-4 py-2 text-center text-[11px] font-semibold text-muted">
                Older enforcement actions not shown — see the audit log
                for the full history.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Release-hold confirmation — replaces the native confirm()
         dialog. No reason input required (the original hold's reason
         is what's already logged), so the dialog is a pure confirm. */}
      <AdminPromptDialog
        open={releaseTarget !== null}
        title={
          releaseTarget
            ? `Release ${releaseTarget.driverName}'s payout hold?`
            : ""
        }
        description="The driver can withdraw again immediately. The release is logged in the moderation trail under your admin id."
        tone="amber"
        inputType="none"
        confirmLabel="Release hold"
        busy={busyId !== null}
        onCancel={() => setReleaseTarget(null)}
        onConfirm={async () => {
          if (!releaseTarget) return;
          await releaseHold(releaseTarget.driverUserId);
          setReleaseTarget(null);
        }}
      />
    </div>
  );
}
