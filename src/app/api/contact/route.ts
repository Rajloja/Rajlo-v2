import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/email-render";

/**
 * POST /api/contact
 *
 * Public contact-form endpoint. Emails the submission to the support
 * inbox with the sender's address as Reply-To, so support can reply
 * straight to the person.
 *
 * Body: { name, email, topic, message }
 *
 * No auth (the form is on the marketing site). Inputs are length-
 * capped and HTML-escaped before they reach the email body.
 */

const CONTACT_INBOX = process.env.CONTACT_INBOX_EMAIL ?? "support@rajlo.com";

type Body = {
  name?: unknown;
  email?: unknown;
  topic?: unknown;
  message?: unknown;
};

/** Coerce to a trimmed string, capped at `max` chars. */
function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const name = clean(body.name, 120);
  const email = clean(body.email, 200);
  const topic = clean(body.topic, 80) || "General question";
  const message = clean(body.message, 5000);

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email and message are all required." },
      { status: 400 },
    );
  }
  // Loose sanity check — enough to reject obvious junk, not an RFC.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "That email address doesn't look right." },
      { status: 400 },
    );
  }

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111906;">
      <p style="margin:0 0 12px;font-weight:700;">New contact message — ${esc(topic)}</p>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${esc(name)}</p>
      <p style="margin:0 0 4px;"><strong>Email:</strong> ${esc(email)}</p>
      <p style="margin:0 0 12px;"><strong>Topic:</strong> ${esc(topic)}</p>
      <p style="margin:0 0 6px;font-weight:700;">Message</p>
      <p style="margin:0;white-space:pre-wrap;">${esc(message)}</p>
    </div>
  `;
  const text =
    `New contact message — ${topic}\n\n` +
    `From: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n` +
    `Message:\n${message}`;

  const result = await sendEmail({
    to: CONTACT_INBOX,
    subject: `[Contact · ${topic}] ${name}`,
    html,
    text,
    replyTo: email,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  // No RESEND_API_KEY (e.g. local dev) — don't fail the submitter;
  // the message just isn't delivered. Surfaced in server logs only.
  if ("skipped" in result) {
    console.warn(`[contact] email skipped: ${result.reason}`);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    {
      error:
        "Couldn't send your message right now. Please try again, or email support@rajlo.com directly.",
    },
    { status: 502 },
  );
}
