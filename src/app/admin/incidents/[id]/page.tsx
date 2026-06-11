"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { AdminPromptDialog } from "@/components/admin-prompt-dialog";

type DialogState =
  | null
  | { kind: "resolve_summary" }
  | { kind: "resolve_action"; resolutionSummary: string }
  | { kind: "add_note" };

/** Chip suggestions for incident resolution summaries — common
 *  phrasings that cut down on "how should I phrase this" friction. */
const RESOLUTION_CHIPS = [
  "Issue confirmed; driver warned and reinstated",
  "Driver suspended pending compliance docs",
  "No evidence found; case closed",
  "Refunded rider; trip excluded from earnings",
  "Escalated to TA for licensing review",
];

const ACTION_CHIPS = [
  "Driver warning issued",
  "Rider refunded in full",
  "Account permanently banned",
  "Wallet credit issued",
  "Referred to TA",
];

const NOTE_CHIPS = [
  "Spoke to reporter via phone — confirms account",
  "Pulled GPS trace — corroborates story",
  "Awaiting evidence from driver",
  "Reviewed in-app chat transcript",
  "Coordinating with TA officer",
];

/**
 * /admin/incidents/[id] — full incident dossier.
 *
 * Shows the report, its evidence, the support notes, and the immutable
 * audit trail — with the workflow controls to change status, record a
 * resolution, self-assign, and add notes. All mutations go through
 * PATCH /api/admin/incidents/[id].
 */

type Detail = {
  incident: {
    id: string;
    incidentType: string;
    severity: string;
    status: string;
    title: string;
    description: string;
    tripId: string | null;
    reporterName: string;
    reporterRole: string | null;
    reporterUserId: string | null;
    incidentTimestamp: string | null;
    reportedAt: string;
    resolutionSummary: string | null;
    actionTaken: string | null;
  };
  evidence: { id: string; evidence_type: string; file_url: string | null; uploaded_at: string }[];
  notes: {
    id: string;
    admin_label: string | null;
    note_text: string;
    is_internal: boolean;
    created_at: string;
  }[];
  auditLogs: {
    id: string;
    action_type: string;
    action_description: string;
    created_at: string;
  }[];
};

const STATUSES = [
  "open",
  "under_review",
  "awaiting_response",
  "escalated",
  "resolved",
  "closed",
];

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  // Confirmation banner shown above the workflow grid so the admin
  // sees their action landed without hunting for a toast.
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/incidents/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail((await res.json()) as Detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (
    body: Record<string, unknown>,
    successMessage?: string,
  ) => {
    setBusy(true);
    setError(null);
    setActionResult(null);
    try {
      const res = await fetch(`/api/admin/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        notified?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (successMessage) {
        const suffix = json.notified ? " Reporter emailed." : "";
        setActionResult(successMessage + suffix);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
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

  const { incident, notes, auditLogs, evidence } = detail;

  return (
    <div className="mx-auto max-w-3xl px-2 py-2 md:px-3 md:py-8">
      <Link
        href="/admin/incidents"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rajlo-red hover:underline"
      >
        <Icon name="arrow-right" className="h-3.5 w-3.5 rotate-180" />
        Incident queue
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
        {incident.title}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {incident.incidentType.replace(/_/g, " ")} · {incident.severity} ·
        reported by {incident.reporterName}
        {incident.reporterRole ? ` (${incident.reporterRole})` : ""}
      </p>

      {error && (
        <p className="mt-3 rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-2.5 text-sm text-rajlo-red">
          {error}
        </p>
      )}

      {/* ── Report ── */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {incident.description}
        </p>
        {incident.tripId && (
          <p className="mt-3 text-xs text-muted">Trip: {incident.tripId}</p>
        )}
      </section>

      {/* ── Workflow ── */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
          Status
        </h2>
        {actionResult && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <Icon name="check-circle" className="h-3 w-3" />
            {actionResult}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || s === incident.status}
              onClick={() =>
                patch(
                  { status: s },
                  `Status changed to "${s.replace(/_/g, " ")}".`,
                )
              }
              className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize disabled:opacity-50 ${
                s === incident.status
                  ? "bg-rajlo-red text-white"
                  : "border border-line bg-background hover:bg-surface-2"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ assignToMe: true }, "Incident assigned to you.")}
            className="rounded-full border border-line bg-background px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
          >
            Assign to me
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog({ kind: "resolve_summary" })}
            className="rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Resolve with summary
          </button>
        </div>
        {incident.resolutionSummary && (
          <p className="mt-3 rounded-xl bg-background p-3 text-xs text-muted">
            <strong>Resolution:</strong> {incident.resolutionSummary}
            {incident.actionTaken ? ` — ${incident.actionTaken}` : ""}
          </p>
        )}
      </section>

      {/* ── Support notes ── */}
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Support notes
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog({ kind: "add_note" })}
            className="rounded-full bg-rajlo-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Add note
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No notes yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-xl border border-line bg-surface p-3.5"
              >
                <p className="text-sm">{n.note_text}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {n.admin_label ?? "Admin"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Evidence ── */}
      {evidence.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
            Evidence ({evidence.length})
          </h2>
          <ul className="space-y-1.5">
            {evidence.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs"
              >
                {e.evidence_type}
                {e.file_url && (
                  <a
                    href={e.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 font-bold text-rajlo-red hover:underline"
                  >
                    View
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Audit trail ── */}
      <section className="mt-5">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          Audit trail
        </h2>
        <ul className="space-y-1.5">
          {auditLogs.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-line bg-surface px-3.5 py-2 text-xs text-muted"
            >
              {a.action_description}
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Custom admin dialogs ───
         Replaces three layered window.prompt calls with branded
         modals that carry quick-reason chips. The resolve flow is
         two steps (summary → action taken) because both fields end
         up on the public-facing email to the reporter. */}
      <AdminPromptDialog
        open={dialog?.kind === "resolve_summary"}
        title="Resolve incident — summary"
        description="Step 1 of 2. This summary is logged and emailed to the reporter."
        tone="emerald"
        inputType="textarea"
        inputLabel="Resolution summary"
        placeholder="What was found and how the incident was handled."
        chips={RESOLUTION_CHIPS}
        confirmLabel="Next"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={(resolutionSummary) =>
          setDialog({ kind: "resolve_action", resolutionSummary })
        }
      />
      <AdminPromptDialog
        open={dialog?.kind === "resolve_action"}
        title="Resolve incident — action taken"
        description="Step 2 of 2. Optional but recommended — shows the reporter what was done in response."
        tone="emerald"
        inputType="textarea"
        inputLabel="Action taken"
        placeholder="e.g. Driver warning issued, rider refunded"
        requireValue={false}
        chips={ACTION_CHIPS}
        confirmLabel="Resolve incident"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={async (actionTaken) => {
          if (dialog?.kind !== "resolve_action") return;
          await patch(
            {
              status: "resolved",
              resolutionSummary: dialog.resolutionSummary,
              actionTaken,
            },
            "Incident resolved.",
          );
          setDialog(null);
        }}
      />

      <AdminPromptDialog
        open={dialog?.kind === "add_note"}
        title="Add support note"
        description="Internal notes are only visible to admins. The reporter is not notified for internal-only notes."
        tone="neutral"
        inputType="textarea"
        inputLabel="Note"
        placeholder="Working notes for the team."
        chips={NOTE_CHIPS}
        confirmLabel="Add note"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={async (note) => {
          await patch({ note }, "Support note added.");
          setDialog(null);
        }}
      />
    </div>
  );
}
