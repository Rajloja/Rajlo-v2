import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminAction, requireAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { renderEmail, type EmailSection } from "@/lib/email-render";
import { pushToUser } from "@/lib/push";

/**
 * POST /api/admin/messages
 * GET  /api/admin/messages
 *
 * The admin messaging center. POST takes a single composer submission
 * and fans it out to every recipient implied by the audience selector.
 * GET returns the most recent broadcasts so the page can render a
 * "what's been sent" history.
 *
 * Audience selectors:
 *   { kind: 'user',         userId: <auth.users.id> }
 *   { kind: 'list',         userIds: <auth.users.id[]> }
 *   { kind: 'role:rider'    }
 *   { kind: 'role:driver'   filter?: 'active' | 'online' | 'all' }
 *   { kind: 'role:admin'    }
 *   { kind: 'all'           }
 *
 * Channels (one or many):
 *   'email'  — Resend send to each recipient's auth.users.email
 *   'push'   — Web push to every device registered for that user
 *   'inbox'  — Insert a row into rider_notifications / driver_notifications
 *
 * The endpoint is best-effort: per-recipient failures don't abort the
 * batch. Aggregate counts come back so the admin sees the result.
 *
 * Hard cap: 5,000 recipients per send. Above that, batch on the client.
 */

const MAX_RECIPIENTS = 5000;

type AudienceKind =
  | "user"
  | "list"
  | "role:rider"
  | "role:driver"
  | "role:admin"
  | "all";

type Channel = "email" | "push" | "inbox";

type SendBody = {
  audience?: {
    kind?: AudienceKind;
    userId?: string;
    userIds?: string[];
    filter?: "all" | "active" | "online";
  };
  channels?: Channel[];
  subject?: string;
  body?: string;
  href?: string;
  cta?: string;
};

type Recipient = {
  userId: string;
  role: "rider" | "driver" | "admin";
  email: string | null;
  name: string | null;
};

type ChannelResult = { sent: number; failed: number; skipped: number };
type SendResults = {
  email: ChannelResult;
  push: ChannelResult;
  inbox: ChannelResult;
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(
    100,
    Math.max(5, parseInt(sp.get("limit") ?? "30", 10) || 30),
  );
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  const { data, error } = await supabase
    .from("admin_messages")
    .select(
      "id, actor_label, audience_kind, audience_size, audience_meta, channels, subject, body, href, cta, results, created_at",
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const fetched = data ?? [];
  const hasMore = fetched.length > limit;
  const messages = hasMore ? fetched.slice(0, limit) : fetched;
  return NextResponse.json({
    messages,
    pagination: { hasMore },
  });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { actor, supabase } = gate;

  const body = (await request.json().catch(() => ({}))) as SendBody;

  /* ─────────── Validate ─────────── */
  const audKind = body.audience?.kind;
  const validKinds: AudienceKind[] = [
    "user",
    "list",
    "role:rider",
    "role:driver",
    "role:admin",
    "all",
  ];
  if (!audKind || !validKinds.includes(audKind)) {
    return NextResponse.json(
      { error: "audience.kind is required" },
      { status: 400 },
    );
  }

  const channels = (body.channels ?? []).filter((c): c is Channel =>
    ["email", "push", "inbox"].includes(c),
  );
  if (channels.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one channel (email / push / inbox)" },
      { status: 400 },
    );
  }

  const subject = (body.subject ?? "").trim();
  const messageBody = (body.body ?? "").trim();
  const href = body.href?.trim() || null;
  const cta = body.cta?.trim() || null;
  if (!subject || !messageBody) {
    return NextResponse.json(
      { error: "Subject and body are required" },
      { status: 400 },
    );
  }
  if (subject.length > 200) {
    return NextResponse.json(
      { error: "Subject must be 200 characters or fewer" },
      { status: 400 },
    );
  }
  if (messageBody.length > 5000) {
    return NextResponse.json(
      { error: "Body must be 5,000 characters or fewer" },
      { status: 400 },
    );
  }

  /* ─────────── Resolve recipients ─────────── */
  const recipients = await resolveRecipients(supabase, body.audience ?? {});
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Audience resolved to zero users — nothing to send" },
      { status: 400 },
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      {
        error: `Audience too large (${recipients.length}). Hard cap is ${MAX_RECIPIENTS} per send — split into batches.`,
      },
      { status: 400 },
    );
  }

  /* ─────────── Fan-out ─────────── */
  const results: SendResults = {
    email: { sent: 0, failed: 0, skipped: 0 },
    push: { sent: 0, failed: 0, skipped: 0 },
    inbox: { sent: 0, failed: 0, skipped: 0 },
  };

  const html = channels.includes("email") ? buildEmailHtml({
    subject,
    body: messageBody,
    href,
    cta,
  }) : null;

  // Sequential per recipient on email (Resend rate limits matter), but
  // within each recipient we fire push + inbox in parallel.
  for (const r of recipients) {
    const tasks: Array<Promise<unknown>> = [];

    if (channels.includes("inbox")) {
      tasks.push(insertInbox(supabase, r, { subject, body: messageBody, href, cta }, results));
    }
    if (channels.includes("push")) {
      tasks.push(
        pushToUser(supabase, r.userId, {
          title: subject,
          body: messageBody.length > 220 ? messageBody.slice(0, 217) + "…" : messageBody,
          url: href ?? "/",
        }).then((res) => {
          if ("ok" in res && res.ok) {
            if (res.sent > 0) results.push.sent += res.sent;
            else results.push.skipped += 1;
          } else if ("skipped" in res && res.skipped) {
            results.push.skipped += 1;
          } else {
            results.push.failed += 1;
          }
        }),
      );
    }
    await Promise.all(tasks);

    // Email is sequential to be polite with Resend's per-second limit.
    if (channels.includes("email") && html) {
      if (!r.email) {
        results.email.skipped += 1;
      } else {
        const send = await sendEmail({
          to: r.email,
          subject,
          html,
          text: messageBody,
        });
        if ("ok" in send && send.ok) results.email.sent += 1;
        else if ("skipped" in send && send.skipped) results.email.skipped += 1;
        else results.email.failed += 1;
      }
    }
  }

  /* ─────────── Persist + audit ───────────
   * If the insert fails we surface the DB error to the admin instead
   * of swallowing it — without this branch a schema/constraint
   * regression reads to the admin as "send succeeded but History is
   * empty," which is the exact symptom that prompted this fix. The
   * outbound channels already fired by the time we reach this point,
   * so a 500 here means "delivered but not logged"; the response
   * still tells the truth. */
  const { data: messageRow, error: persistError } = await supabase
    .from("admin_messages")
    .insert({
      actor_id: actor.userId,
      actor_label: actor.label,
      audience_kind: audKind,
      audience_size: recipients.length,
      audience_meta: buildAudienceMeta(audKind, body.audience ?? {}, recipients),
      channels,
      subject,
      body: messageBody,
      href,
      cta,
      results,
    })
    .select("id")
    .single();

  if (persistError) {
    // eslint-disable-next-line no-console
    console.error(
      "[admin/messages] Persist failed despite delivery succeeding:",
      persistError,
    );
    return NextResponse.json(
      {
        error: `Delivered to ${recipients.length} recipient(s), but the History row failed to save: ${persistError.message}`,
        recipients: recipients.length,
        results,
      },
      { status: 500 },
    );
  }

  await logAdminAction(supabase, actor, {
    targetType:
      audKind === "user" || audKind === "list"
        ? "rider"
        : audKind === "role:driver"
          ? "driver"
          : audKind === "role:admin"
            ? "admin"
            : "system",
    targetId: messageRow?.id ?? null,
    targetLabel: subject,
    action: "broadcast",
    summary: `${actor.label} sent "${subject}" via ${channels.join(" + ")} to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"} (${audKind})`,
    metadata: { audKind, channels, recipients: recipients.length, results },
  });

  return NextResponse.json({
    ok: true,
    messageId: messageRow?.id ?? null,
    recipients: recipients.length,
    results,
  });
}

/* ─────────────────────────── helpers ─────────────────────────── */

async function resolveRecipients(
  supabase: SupabaseClient,
  audience: NonNullable<SendBody["audience"]>,
): Promise<Recipient[]> {
  const kind = audience.kind!;

  // Pull profiles + emails in two parallel passes, then merge. We need
  // emails for the email channel; profiles for the role + display name.
  let userIds: string[] = [];
  if (kind === "user") {
    if (audience.userId) userIds = [audience.userId];
  } else if (kind === "list") {
    userIds = (audience.userIds ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
  } else if (kind === "role:driver") {
    let q = supabase
      .from("drivers")
      .select("user_id, activated, is_online")
      .not("user_id", "is", null);
    if (audience.filter === "active") q = q.eq("activated", true);
    if (audience.filter === "online") q = q.eq("activated", true).eq("is_online", true);
    const { data } = await q;
    userIds = ((data ?? []) as { user_id: string }[]).map((d) => d.user_id);
  } else {
    const role = kind === "role:rider" ? "rider" : kind === "role:admin" ? "admin" : null;
    if (role) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", role);
      userIds = ((data ?? []) as { id: string }[]).map((p) => p.id);
    } else {
      // 'all' — every profile.
      const { data } = await supabase.from("profiles").select("id");
      userIds = ((data ?? []) as { id: string }[]).map((p) => p.id);
    }
  }
  userIds = Array.from(new Set(userIds));
  if (userIds.length === 0) return [];

  // Hydrate role + name from profiles, email from auth.users.
  const profilesP = supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("id", userIds);

  // auth.admin.listUsers paginates — pull the full set and look up by id.
  // For audiences over 1k this gets expensive; the MAX_RECIPIENTS cap of
  // 5k keeps the total cost bounded.
  const emailMap = new Map<string, string | null>();
  try {
    let page = 1;
    while (page < 6) {
      const { data } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      const batch = data?.users ?? [];
      batch.forEach((u) => emailMap.set(u.id, u.email ?? null));
      if (batch.length < 1000) break;
      page++;
    }
  } catch (e) {
    console.error(
      "listUsers failed during message resolve:",
      e instanceof Error ? e.message : "unknown error",
    );
  }

  const { data: profileRows } = await profilesP;
  const profileMap = new Map(
    ((profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      role: "rider" | "driver" | "admin";
    }>).map((p) => [p.id, p]),
  );

  return userIds.map((id) => {
    const p = profileMap.get(id);
    return {
      userId: id,
      role: p?.role ?? "rider",
      email: emailMap.get(id) ?? null,
      name: p?.full_name ?? null,
    };
  });
}

async function insertInbox(
  supabase: SupabaseClient,
  r: Recipient,
  payload: { subject: string; body: string; href: string | null; cta: string | null },
  results: SendResults,
): Promise<void> {
  // Riders + drivers have separate inbox tables. Admins don't have an
  // in-app inbox surface yet, so 'inbox' for an admin is a skip.
  try {
    if (r.role === "rider") {
      const { error } = await supabase.from("rider_notifications").insert({
        rider_id: r.userId,
        kind: "system",
        title: payload.subject,
        body: payload.body,
        href: payload.href,
        cta: payload.cta,
      });
      if (error) results.inbox.failed += 1;
      else results.inbox.sent += 1;
    } else if (r.role === "driver") {
      const { error } = await supabase.from("driver_notifications").insert({
        driver_id: r.userId,
        kind: "system",
        title: payload.subject,
        body: payload.body,
        href: payload.href,
        cta: payload.cta,
      });
      if (error) results.inbox.failed += 1;
      else results.inbox.sent += 1;
    } else {
      results.inbox.skipped += 1;
    }
  } catch {
    results.inbox.failed += 1;
  }
}

function buildEmailHtml({
  subject,
  body,
  href,
  cta,
}: {
  subject: string;
  body: string;
  href: string | null;
  cta: string | null;
}): string {
  // Split body on blank lines into paragraphs so admins can write
  // multi-paragraph copy without HTML.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sections: EmailSection[] = paragraphs.map((p, i) =>
    i === 0 ? { type: "intro", text: p } : { type: "paragraph", text: p },
  );
  if (href && cta) {
    sections.push({ type: "cta", href, label: cta });
  } else if (href) {
    sections.push({ type: "linkRow", href, label: href });
  }
  sections.push({
    type: "footnote",
    text: "You're receiving this because you have a Rajlo account. Manage your notifications in app settings.",
  });

  return renderEmail({
    preheader: paragraphs[0]?.slice(0, 140) ?? subject,
    eyebrow: "Rajlo update",
    title: subject,
    sections,
  });
}

function buildAudienceMeta(
  kind: AudienceKind,
  audience: NonNullable<SendBody["audience"]>,
  recipients: Recipient[],
): Record<string, unknown> {
  if (kind === "user") {
    const r = recipients[0];
    return {
      userId: audience.userId ?? null,
      label: r ? `${r.name ?? "Unnamed"} (${r.role})` : null,
    };
  }
  if (kind === "list") {
    return {
      userIds: audience.userIds ?? [],
      sample: recipients.slice(0, 5).map((r) => r.name ?? r.userId),
    };
  }
  if (kind === "role:driver") {
    return { filter: audience.filter ?? "all" };
  }
  return {};
}
