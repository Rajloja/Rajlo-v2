/**
 * Tiny Resend transactional-email helper. We POST directly to Resend's REST
 * API so we don't add another SDK to the bundle.
 *
 * Requires:
 *   RESEND_API_KEY     — secret key from resend.com (starts with `re_`)
 *   RESEND_FROM_EMAIL  — verified sender, e.g. "Rajlo <noreply@rajlo.com>"
 *
 * Both are read at request time (not module init) so missing env vars degrade
 * gracefully — the function returns { skipped: true } and the caller can
 * proceed without breaking the user-facing flow.
 */

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. */
  text?: string;
  /** Optional Reply-To — e.g. the contact-form submitter's address so
   *  support can reply straight to them. */
  replyTo?: string;
};

type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { ok: false; skipped: true; reason: string };

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Rajlo <noreply@rajlo.com>";

  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      reason: "RESEND_API_KEY not set — email notifications disabled in dev",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text,
        reply_to: replyTo,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        error: body.message ?? `Resend returned ${res.status}`,
      };
    }

    const data = (await res.json()) as { id: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Resend request failed",
    };
  }
}
