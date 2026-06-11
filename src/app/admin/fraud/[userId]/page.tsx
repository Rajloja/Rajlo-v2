"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import {
  AdminPromptDialog,
  type DialogTone,
} from "@/components/admin-prompt-dialog";

/**
 * /admin/fraud/[userId] — full fraud profile for one account.
 *
 * Shows the risk score + its breakdown, every fraud flag, device
 * fingerprints, linked accounts (device/IP overlap), and
 * investigations — with the admin actions to recalculate, flag,
 * investigate, and resolve. All mutations go through
 * POST /api/admin/fraud/[userId] (gated by `manage_fraud`).
 */

type Detail = {
  user: { id: string; name: string; role: string };
  riskScore: {
    score: number;
    level: string;
    breakdown: Record<string, number>;
    lastCalculatedAt: string;
  } | null;
  flags: {
    id: string;
    flag_type: string;
    severity: string;
    description: string;
    created_at: string;
    resolved_at: string | null;
  }[];
  fingerprints: {
    fingerprint_hash: string;
    ip_address: string | null;
    device_type: string | null;
    os_version: string | null;
    created_at: string;
  }[];
  linkedAccounts: { userId: string; name: string }[];
  investigations: {
    id: string;
    status: string;
    summary: string;
    resolution: string | null;
    created_at: string;
  }[];
};

const LEVEL_STYLE: Record<string, string> = {
  low: "bg-surface-soft text-muted",
  moderate: "bg-amber-50 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-primary-soft text-rajlo-red",
};

/** All possible single-dialog configurations on this page. Each is
 *  fully self-contained so the JSX `<AdminPromptDialog>` below just
 *  consumes whatever is currently active without inline branching. */
type DialogState =
  | null
  | {
      kind: "moderation";
      action: string;
      label: string;
      tone: DialogTone;
      chips: string[];
    }
  | { kind: "raise_flag_type" }
  | {
      kind: "raise_flag_description";
      flagType: string;
    }
  | {
      kind: "raise_flag_severity";
      flagType: string;
      description: string;
    }
  | { kind: "open_investigation" }
  | {
      kind: "resolve_investigation";
      investigationId: string;
    };

/** Quick-reason chips per enforcement action — common phrasings the
 *  admin can tap to pre-fill the reason field. Drives the dialog's
 *  `chips` prop. Keeping the chips action-specific makes them
 *  genuinely useful instead of one-size-fits-all noise. */
const MODERATION_CHIPS: Record<string, string[]> = {
  warning: [
    "First-time complaint logged",
    "Late pickup pattern",
    "Minor TA tariff violation",
    "Customer-service tone",
  ],
  temporary_suspension: [
    "Multiple complaints in 7 days",
    "GPS spoofing — under investigation",
    "Unverified vehicle change",
    "Repeated trip cancellations",
  ],
  permanent_ban: [
    "Confirmed GPS spoofing",
    "Identity fraud confirmed",
    "Safety incident — TA-reported",
    "Repeated bans evaded via new account",
  ],
  reinstatement: [
    "Investigation closed — no fault",
    "Customer complaint withdrawn",
    "Compliance docs re-submitted",
  ],
  payout_hold: [
    "Pending fraud investigation",
    "Bank details under verification",
    "TA compliance check",
    "Suspected wash trades",
  ],
};

const MODERATION_TONE: Record<string, DialogTone> = {
  warning: "amber",
  temporary_suspension: "amber",
  permanent_ban: "red",
  reinstatement: "emerald",
  payout_hold: "red",
};

export default function FraudUserPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  // Inline confirmation banner shown right above the enforcement
  // grid so the admin sees the action landed without having to
  // hunt for a toast elsewhere. Auto-clears on next action.
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/fraud/${userId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail((await res.json()) as Detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    body: Record<string, unknown>,
    successMessage?: string,
  ) => {
    setBusy(true);
    setError(null);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/fraud/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (successMessage) setActionResult(successMessage);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  // Enforcement actions route to the moderation API.
  const moderate = async (action: string, reason: string, label: string) => {
    setBusy(true);
    setError(null);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/moderation/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      }
      setActionResult(`${label} recorded. Action logged in moderation.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enforcement failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-8">
        <Skeleton className="h-64 w-full" rounded="lg" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-8">
        <p className="text-sm text-rajlo-red">{error ?? "Not found."}</p>
      </div>
    );
  }

  const { user, riskScore, flags, fingerprints, linkedAccounts, investigations } =
    detail;

  return (
    <div className="mx-auto max-w-3xl px-2 py-2 md:px-3 md:py-8">
      <Link
        href="/admin/fraud"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rajlo-red hover:underline"
      >
        <Icon name="arrow-right" className="h-3.5 w-3.5 rotate-180" />
        Fraud dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
        {user.name}
      </h1>
      <p className="text-sm text-muted">{user.role}</p>

      {error && (
        <p className="mt-3 rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-2.5 text-sm text-rajlo-red">
          {error}
        </p>
      )}

      {/* ── Risk score ── */}
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Risk score
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ action: "recalculate" })}
            className="rounded-full border border-line bg-background px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
          >
            Recalculate
          </button>
        </div>
        {riskScore ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-4xl font-extrabold tabular-nums">
                {riskScore.score}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  LEVEL_STYLE[riskScore.level] ?? LEVEL_STYLE.low
                }`}
              >
                {riskScore.level}
              </span>
            </div>
            <ul className="mt-3 space-y-1">
              {Object.entries(riskScore.breakdown)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <li
                    key={k}
                    className="flex justify-between text-xs text-muted"
                  >
                    <span>{k}</span>
                    <span className="font-bold">+{v}</span>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Not scored yet — tap Recalculate.
          </p>
        )}
      </section>

      {/* ── Enforcement ── */}
      <section className="mt-6 rounded-2xl border border-rajlo-red/20 bg-primary-soft/40 p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-rajlo-red">
          Enforcement
        </h2>
        <p className="mt-1 text-xs text-muted">
          Actions are recorded in the moderation log. Suspensions and
          bans block the account from signing in.
        </p>
        {actionResult && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <Icon name="check-circle" className="h-3 w-3" />
            {actionResult}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { action: "warning", label: "Warn" },
            { action: "temporary_suspension", label: "Suspend 30d" },
            { action: "permanent_ban", label: "Permanent ban" },
            { action: "reinstatement", label: "Reinstate" },
            ...(user.role === "driver"
              ? [{ action: "payout_hold", label: "Hold payouts" }]
              : []),
          ].map((b) => (
            <button
              key={b.action}
              type="button"
              disabled={busy}
              onClick={() =>
                setDialog({
                  kind: "moderation",
                  action: b.action,
                  label: b.label,
                  tone: MODERATION_TONE[b.action] ?? "red",
                  chips: MODERATION_CHIPS[b.action] ?? [],
                })
              }
              className="rounded-full border border-rajlo-red/30 bg-background px-3 py-1.5 text-xs font-bold text-rajlo-red hover:bg-surface-2 disabled:opacity-50"
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Flags ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Fraud flags
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog({ kind: "raise_flag_type" })}
            className="rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Raise flag
          </button>
        </div>
        {flags.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No flags on this account.
          </p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-line bg-surface p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-rajlo-red">
                    {f.flag_type}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      LEVEL_STYLE[f.severity] ?? LEVEL_STYLE.low
                    }`}
                  >
                    {f.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm">{f.description}</p>
                {f.resolved_at ? (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                    Resolved
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: "resolve_flag", flagId: f.id })}
                    className="mt-2 rounded-full border border-line bg-background px-3 py-1 text-[11px] font-bold hover:bg-surface-2 disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Linked accounts ── */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          Linked accounts ({linkedAccounts.length})
        </h2>
        {linkedAccounts.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No accounts share this user&apos;s device or IP.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {linkedAccounts.map((a) => (
              <li key={a.userId}>
                <Link
                  href={`/admin/fraud/${a.userId}`}
                  className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-rajlo-red"
                >
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Investigations ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Investigations
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog({ kind: "open_investigation" })}
            className="rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Open investigation
          </button>
        </div>
        {investigations.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No investigations.
          </p>
        ) : (
          <ul className="space-y-2">
            {investigations.map((inv) => (
              <li
                key={inv.id}
                className="rounded-xl border border-line bg-surface p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {inv.status}
                  </span>
                </div>
                <p className="mt-1 text-sm">{inv.summary}</p>
                {inv.resolution && (
                  <p className="mt-1 text-xs text-muted">
                    Resolution: {inv.resolution}
                  </p>
                )}
                {inv.status !== "resolved" && inv.status !== "dismissed" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setDialog({
                        kind: "resolve_investigation",
                        investigationId: inv.id,
                      })
                    }
                    className="mt-2 rounded-full border border-line bg-background px-3 py-1 text-[11px] font-bold hover:bg-surface-2 disabled:opacity-50"
                  >
                    Resolve
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Device fingerprints ── */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          Device fingerprints ({fingerprints.length})
        </h2>
        {fingerprints.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No fingerprints captured yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fingerprints.map((fp, i) => (
              <li
                key={i}
                className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs"
              >
                <p className="font-mono text-[11px] text-muted">
                  {fp.fingerprint_hash.slice(0, 24)}…
                </p>
                <p className="mt-0.5 text-muted">
                  {fp.device_type ?? "?"} · {fp.os_version ?? "?"} ·{" "}
                  {fp.ip_address ?? "no IP"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Custom admin prompt dialog ───
         Single mount; the active configuration is driven by the
         `dialog` state. Every admin action that used to spawn a
         native `window.prompt` flows through here so the UX is
         consistent and the chip suggestions land. */}
      <AdminPromptDialog
        open={dialog?.kind === "moderation"}
        title={
          dialog?.kind === "moderation"
            ? `Reason for "${dialog.label}"`
            : ""
        }
        description="Logged in the moderation trail. The affected user is notified of the action (not the reason text itself)."
        tone={dialog?.kind === "moderation" ? dialog.tone : "red"}
        inputType="textarea"
        inputLabel="Reason"
        placeholder="Why are you taking this action?"
        chips={dialog?.kind === "moderation" ? dialog.chips : []}
        requireValue={
          dialog?.kind === "moderation" &&
          dialog.action !== "warning" &&
          dialog.action !== "reinstatement"
        }
        confirmLabel={dialog?.kind === "moderation" ? dialog.label : ""}
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={async (reason) => {
          if (dialog?.kind !== "moderation") return;
          await moderate(dialog.action, reason, dialog.label);
          setDialog(null);
        }}
      />

      {/* Raise flag — three-step prompt: type → description → severity. */}
      <AdminPromptDialog
        open={dialog?.kind === "raise_flag_type"}
        title="Raise a fraud flag — type"
        description="Step 1 of 3 · pick or type the flag type"
        tone="red"
        inputType="text"
        inputLabel="Flag type"
        placeholder="gps_spoofing"
        chips={[
          "gps_spoofing",
          "impossible_travel",
          "shared_device",
          "shared_ip",
          "identity_mismatch",
          "rapid_account_creation",
        ]}
        confirmLabel="Next"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={(flagType) =>
          setDialog({ kind: "raise_flag_description", flagType })
        }
      />
      <AdminPromptDialog
        open={dialog?.kind === "raise_flag_description"}
        title="Raise a fraud flag — description"
        description="Step 2 of 3 · what evidence supports this flag?"
        tone="red"
        inputType="textarea"
        inputLabel="Description"
        placeholder="What did you observe?"
        chips={[
          "Driver GPS jumped 30 km in under a minute",
          "Same device fingerprint across multiple accounts",
          "Photo ID doesn't match selfie",
          "Multiple accounts created from same IP within an hour",
        ]}
        confirmLabel="Next"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={(description) => {
          if (dialog?.kind !== "raise_flag_description") return;
          setDialog({
            kind: "raise_flag_severity",
            flagType: dialog.flagType,
            description,
          });
        }}
      />
      <AdminPromptDialog
        open={dialog?.kind === "raise_flag_severity"}
        title="Raise a fraud flag — severity"
        description="Step 3 of 3 · how serious is this?"
        tone="red"
        inputType="text"
        inputLabel="Severity"
        placeholder="medium"
        chips={["low", "medium", "high", "critical"]}
        confirmLabel="Raise flag"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={async (severity) => {
          if (dialog?.kind !== "raise_flag_severity") return;
          await act(
            {
              action: "raise_flag",
              flagType: dialog.flagType,
              description: dialog.description,
              severity: severity || "medium",
            },
            "Fraud flag raised.",
          );
          setDialog(null);
        }}
      />

      <AdminPromptDialog
        open={dialog?.kind === "open_investigation"}
        title="Open an investigation"
        description="A short summary of what you're looking into. The investigation row is logged immediately and can be resolved later with a final note."
        tone="red"
        inputType="textarea"
        inputLabel="Summary"
        placeholder="e.g. Driver accumulated 4 impossible-travel flags this week"
        chips={[
          "Multiple impossible-travel flags in 24h",
          "Identity verification mismatch",
          "Shared-device cluster review",
          "Suspected fraud ring — see linked accounts",
        ]}
        confirmLabel="Open"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={async (summary) => {
          await act(
            { action: "open_investigation", summary },
            "Investigation opened.",
          );
          setDialog(null);
        }}
      />

      <AdminPromptDialog
        open={dialog?.kind === "resolve_investigation"}
        title="Resolve investigation"
        description="Optional final note. Closes the investigation and marks it resolved."
        tone="emerald"
        inputType="textarea"
        inputLabel="Resolution note"
        placeholder="Optional"
        requireValue={false}
        chips={[
          "Closed — no fraud confirmed",
          "Account warned and reinstated",
          "Account suspended pending compliance",
          "Linked accounts reviewed and cleared",
        ]}
        confirmLabel="Resolve"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={async (resolution) => {
          if (dialog?.kind !== "resolve_investigation") return;
          await act(
            {
              action: "resolve_investigation",
              investigationId: dialog.investigationId,
              status: "resolved",
              resolution,
            },
            "Investigation resolved.",
          );
          setDialog(null);
        }}
      />
    </div>
  );
}
