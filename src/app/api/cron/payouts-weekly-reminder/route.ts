import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site-config";

/**
 * GET /api/cron/payouts-weekly-reminder
 *
 * Monday-morning email to every active contact recipient (Rajlo admin
 * roster) summarising the pending driver payout batch. Weekly bank
 * batches are still MANUAL until the receiving bank's ingest is
 * automated — so without this reminder, Raj / admin have to remember
 * to open /admin/payouts every Monday, which is exactly the kind of
 * operational task that gets missed during a stressful week.
 *
 * Cadence: Vercel Cron fires Monday 12:00 UTC = 07:00 Jamaica local
 * (America/Jamaica is UTC-5 year-round, no DST). See vercel.json for
 * the schedule wiring.
 *
 * No email is sent when there are zero pending payouts — no news is
 * good news; a "0 pending" alert every Monday would train the admins
 * to ignore it.
 *
 * Auth: same CRON_SECRET pattern as /api/cron/document-expiry. When
 * set, a random caller can't trigger fake reminders.
 */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "service_role_missing" },
      { status: 500 },
    );
  }

  // Pull pending payouts + total. wallet_withdrawals status='pending'
  // means the driver has requested a withdrawal (OTP verified) but the
  // admin hasn't batched it yet. Anything already 'batched' or 'paid'
  // is out of scope for the reminder.
  const { data: pending } = await supabase
    .from("wallet_withdrawals")
    .select("id, amount_jmd")
    .eq("status", "pending");

  const count = pending?.length ?? 0;
  const totalJmd = (pending ?? []).reduce(
    (sum, r) => sum + (r.amount_jmd ?? 0),
    0,
  );

  if (count === 0) {
    // No pending payouts → silence. Also return early so the response
    // still 200s for the cron logs, which lets uptime monitoring see
    // the cron IS running even on quiet weeks.
    return NextResponse.json({
      ok: true,
      sent: 0,
      pendingCount: 0,
      pendingTotalJmd: 0,
    });
  }

  // Active admin recipients — same table the contact form uses.
  const { data: recipients } = await supabase
    .from("contact_recipients")
    .select("email")
    .eq("active", true);
  const emails = (recipients ?? [])
    .map((r) => r.email)
    .filter((e): e is string => typeof e === "string" && e.length > 0);

  if (emails.length === 0) {
    // No configured recipients → don't try to send. Still return a
    // non-error 200 so cron logs show the run completed; the ops
    // takeaway is "add a recipient" not "fix the cron."
    return NextResponse.json({
      ok: true,
      sent: 0,
      pendingCount: count,
      pendingTotalJmd: totalJmd,
      warning: "no_active_recipients",
    });
  }

  const subject = `Rajlo · Weekly payout batch reminder — ${count} pending (JMD ${totalJmd.toLocaleString("en-JM")})`;
  const dashboardUrl = `${SITE_URL}/admin/payouts`;

  // Simple internal alert — plain-text friendly + a matching HTML body.
  // Deliberately NOT a full branded template. This is a Raj-to-Raj
  // reminder, not a customer email; the goal is to get read + acted
  // on in 10 seconds.
  const text = [
    `Good morning — it's Monday, time to run the driver payout batch.`,
    ``,
    `${count} driver${count === 1 ? "" : "s"} waiting.`,
    `Total: JMD ${totalJmd.toLocaleString("en-JM")}`,
    ``,
    `Open the batch tool: ${dashboardUrl}`,
    ``,
    `— Rajlo Cron`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #161b22;">
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #dc2626; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Weekly payout batch reminder</p>
    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 800;">Good morning — it's Monday.</h1>
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.55;">Time to run the driver payout batch. Numbers as of ${new Date().toLocaleDateString("en-JM", { timeZone: "America/Jamaica", year: "numeric", month: "long", day: "numeric" })}:</p>
    <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #f9fafb; margin: 0 0 20px 0;">
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280;">Drivers waiting</p>
      <p style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800;">${count}</p>
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280;">Total to disburse</p>
      <p style="margin: 0; font-size: 22px; font-weight: 800;">JMD ${totalJmd.toLocaleString("en-JM")}</p>
    </div>
    <a href="${dashboardUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 14px;">Open batch tool →</a>
    <p style="margin: 24px 0 0 0; font-size: 12px; color: #9ca3af;">— Rajlo Cron</p>
  </body></html>`;

  // Fire-and-forget to each recipient. Any single-email failure gets
  // swallowed (email.ts already returns { ok, error } rather than
  // throwing) so a bad row on the roster doesn't drop the batch for
  // the others. Track successes for the response body / cron log.
  let sent = 0;
  await Promise.all(
    emails.map(async (to) => {
      const res = await sendEmail({ to, subject, html, text });
      if (res.ok) sent += 1;
    }),
  );

  return NextResponse.json({
    ok: true,
    sent,
    pendingCount: count,
    pendingTotalJmd: totalJmd,
  });
}
