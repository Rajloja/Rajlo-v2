import { NextResponse } from "next/server";
import {
  requirePermission,
  requireAdmin,
  logAdminAction,
} from "@/lib/admin-auth";
import { hasPermission } from "@/lib/admin-rbac";
import { sendEmail } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";

const INCIDENT_PUBLIC_STATUS: Record<string, string> = {
  open: "Open",
  under_review: "Under review",
  awaiting_response: "Awaiting response",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

/** Look up the reporter's email + first name for a notification.
 *  Returns null when we don't have an email to write to — caller
 *  short-circuits the send in that case. */
async function loadReporterContact(
  supabase: SupabaseClient,
  reporterUserId: string | null,
): Promise<{ email: string; firstName: string | null } | null> {
  if (!reporterUserId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", reporterUserId)
    .maybeSingle();
  const row = data as { email: string | null; full_name: string | null } | null;
  if (!row?.email) return null;
  return {
    email: row.email,
    firstName: row.full_name?.split(" ")[0] ?? null,
  };
}

/** Send an incident-progress email to the reporter. Fire-and-forget;
 *  the calling endpoint reports whether a notification was actually
 *  dispatched via the response payload so the admin UI can confirm. */
async function emailReporter(
  contact: { email: string; firstName: string | null },
  args: {
    incidentTitle: string;
    body: string;
    cta?: { label: string; href: string };
  },
): Promise<boolean> {
  const greeting = contact.firstName ? `Hi ${contact.firstName},` : "Hi,";
  const ctaHtml = args.cta
    ? `<p style="margin:24px 0"><a href="${args.cta.href}" style="background:#f10100;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700;display:inline-block">${args.cta.label}</a></p>`
    : "";
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#111906;max-width:560px;margin:0 auto;padding:24px">
      <p style="margin:0 0 16px;font-size:18px"><strong>Rajlo Safety — incident update</strong></p>
      <p style="margin:0 0 12px">${greeting}</p>
      <p style="margin:0 0 12px"><em>${args.incidentTitle}</em></p>
      <div style="margin:0 0 12px;white-space:pre-wrap">${args.body}</div>
      ${ctaHtml}
      <p style="margin:24px 0 0;color:#6b7077;font-size:12px">You're getting this because you filed this report through the Rajlo app. Reply to this email to add more info; we read every message.</p>
    </div>`;
  const text = `${greeting}\n\n${args.incidentTitle}\n\n${args.body}\n\n— Rajlo Safety`;
  const result = await sendEmail({
    to: contact.email,
    subject: `Rajlo Safety — ${args.incidentTitle}`,
    html,
    text,
    replyTo: process.env.SAFETY_REPLY_TO_EMAIL,
  });
  return "ok" in result && result.ok;
}

/**
 * GET   /api/admin/incidents/[id] — full incident dossier
 * PATCH /api/admin/incidents/[id] — update status / assignment /
 *                                   resolution, or add a support note
 *
 * GET needs `view_incidents`; mutations need `manage_incidents`. Every
 * change writes an `incident_audit_logs` row — the immutable trail.
 *
 * PATCH body (one of):
 *   { status, resolutionSummary?, actionTaken? }  — workflow update
 *   { note, isInternal? }                         — add a support note
 *   { assignToMe: true }                          — self-assign
 */

const VALID_STATUS = [
  "open",
  "under_review",
  "awaiting_response",
  "escalated",
  "resolved",
  "closed",
];

type ProfileRow = { id: string; full_name: string | null };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("view_incidents");
  if (gate.error) return gate.error;
  const { supabase } = gate;
  const { id } = await params;

  const { data: incident } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const [{ data: evidence }, { data: notes }, { data: auditLogs }] =
    await Promise.all([
      supabase
        .from("incident_evidence")
        .select("id, evidence_type, file_url, uploaded_at")
        .eq("incident_id", id)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("support_notes")
        .select("id, admin_label, note_text, is_internal, created_at")
        .eq("incident_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("incident_audit_logs")
        .select("id, action_type, action_description, created_at")
        .eq("incident_id", id)
        .order("created_at", { ascending: false }),
    ]);

  // Reporter name.
  let reporterName = "Unknown";
  if (incident.reporter_user_id) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", incident.reporter_user_id)
      .maybeSingle();
    reporterName = (data as ProfileRow | null)?.full_name ?? "Unnamed user";
  }

  return NextResponse.json({
    incident: {
      id: incident.id,
      incidentType: incident.incident_type,
      severity: incident.severity_level,
      status: incident.status,
      title: incident.title,
      description: incident.description,
      tripId: incident.trip_id,
      reporterName,
      reporterRole: incident.reporter_role,
      reporterUserId: incident.reporter_user_id,
      context: incident.context,
      incidentTimestamp: incident.incident_timestamp,
      reportedAt: incident.reported_at,
      resolvedAt: incident.resolved_at,
      resolutionSummary: incident.resolution_summary,
      actionTaken: incident.action_taken,
    },
    evidence: evidence ?? [],
    notes: notes ?? [],
    auditLogs: auditLogs ?? [],
  });
}

type PatchBody = {
  status?: unknown;
  resolutionSummary?: unknown;
  actionTaken?: unknown;
  note?: unknown;
  isInternal?: unknown;
  assignToMe?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // A note can be added by any incident-viewer; workflow changes need
  // manage_incidents. We gate generously then re-check below.
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { actor, supabase } = gate;
  if (!hasPermission(actor.adminRole, "view_incidents")) {
    return NextResponse.json(
      { error: "insufficient_permission" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const canManage = hasPermission(actor.adminRole, "manage_incidents");

  const { data: incident } = await supabase
    .from("incidents")
    .select("id, status, title, reporter_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }
  const incidentTitle =
    (incident as { title?: string | null }).title ?? "Your incident report";
  const reporterUserId = (incident as { reporter_user_id?: string | null })
    .reporter_user_id ?? null;

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  // ── Add a support note ──
  if (typeof body.note === "string" && body.note.trim()) {
    if (!canManage) {
      return NextResponse.json(
        { error: "insufficient_permission" },
        { status: 403 },
      );
    }
    // Default-isInternal: notes are internal-by-default unless the
    // admin explicitly flips it off. Only NON-internal notes notify
    // the reporter — internal notes are working-comments for the
    // admin team.
    const isInternal = body.isInternal !== false;
    await supabase.from("support_notes").insert({
      incident_id: id,
      admin_user_id: actor.userId,
      admin_label: actor.label,
      note_text: body.note.trim(),
      is_internal: isInternal,
    });
    await supabase.from("incident_audit_logs").insert({
      incident_id: id,
      action_type: "note_added",
      action_description: `${actor.label} added a support note`,
      admin_user_id: actor.userId,
    });
    let notified = false;
    if (!isInternal) {
      const contact = await loadReporterContact(supabase, reporterUserId);
      if (contact) {
        notified = await emailReporter(contact, {
          incidentTitle,
          body: `An update has been added to your incident report:\n\n${body.note.trim()}`,
        });
      }
    }
    return NextResponse.json({ ok: true, notified });
  }

  // ── Self-assign ──
  if (body.assignToMe === true) {
    if (!canManage) {
      return NextResponse.json(
        { error: "insufficient_permission" },
        { status: 403 },
      );
    }
    await supabase
      .from("incidents")
      .update({ assigned_admin_id: actor.userId, updated_at: new Date().toISOString() })
      .eq("id", id);
    await supabase.from("incident_audit_logs").insert({
      incident_id: id,
      action_type: "assigned",
      action_description: `${actor.label} took ownership of the incident`,
      admin_user_id: actor.userId,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Workflow / status update ──
  if (typeof body.status === "string") {
    if (!canManage) {
      return NextResponse.json(
        { error: "insufficient_permission" },
        { status: 403 },
      );
    }
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const isClosed = body.status === "resolved" || body.status === "closed";
    const update: Record<string, unknown> = {
      status: body.status,
      updated_at: new Date().toISOString(),
    };
    if (typeof body.resolutionSummary === "string") {
      update.resolution_summary = body.resolutionSummary.trim() || null;
    }
    if (typeof body.actionTaken === "string") {
      update.action_taken = body.actionTaken.trim() || null;
    }
    update.resolved_at = isClosed ? new Date().toISOString() : null;

    await supabase.from("incidents").update(update).eq("id", id);
    await supabase.from("incident_audit_logs").insert({
      incident_id: id,
      action_type: "status_changed",
      action_description: `${actor.label} set status to ${body.status}`,
      admin_user_id: actor.userId,
      metadata: { from: incident.status, to: body.status },
    });
    // Also surface in the platform-wide audit feed so the compliance
    // trail at /admin/audit-logs is complete.
    await logAdminAction(supabase, actor, {
      targetType: "system",
      targetId: id,
      targetLabel: "Incident",
      action: "incident_status_changed",
      summary: `${actor.label} set incident status to ${body.status}`,
    });
    // Notify the reporter on every status change. The resolution
    // summary + action-taken get folded into the body when present
    // so the email carries the actual outcome, not just "status
    // changed."
    let notified = false;
    const contact = await loadReporterContact(supabase, reporterUserId);
    if (contact) {
      const publicStatus =
        INCIDENT_PUBLIC_STATUS[body.status] ?? body.status;
      let mailBody = `Your report is now: ${publicStatus}.`;
      if (typeof body.resolutionSummary === "string" && body.resolutionSummary.trim()) {
        mailBody += `\n\nWhat we found / decided:\n${body.resolutionSummary.trim()}`;
      }
      if (typeof body.actionTaken === "string" && body.actionTaken.trim()) {
        mailBody += `\n\nAction we took:\n${body.actionTaken.trim()}`;
      }
      mailBody +=
        "\n\nIf there's anything else we should know, reply to this email — it goes straight to our safety team.";
      notified = await emailReporter(contact, {
        incidentTitle,
        body: mailBody,
      });
    }
    return NextResponse.json({ ok: true, notified });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}
