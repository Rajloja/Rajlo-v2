import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sendPoliceRecordReminderEmail } from "@/lib/email-templates";
import { notifyDriver } from "@/lib/notify";
import { APP_URL } from "@/lib/email-render";

/**
 * GET /api/cron/police-record-reminder
 *
 * Daily nudge to drivers who signed up but haven't uploaded their
 * Police Record / Good Conduct Certificate yet.
 *
 * Why this exists: police record is OPTIONAL at onboarding (a
 * field-agent employer might sign a driver up at a taxi hub before
 * they've had a chance to visit a police station), so the runtime
 * eligibility gate — checkDriverOperationEligibility() — blocks such
 * drivers from going online. Without a reminder loop, those drivers
 * just sit in "activated but can't dispatch" limbo forever.
 *
 * Cadence: this cron runs daily but per-driver we throttle to at most
 * once every 7 days via drivers.police_record_reminder_sent_at. Tone
 * of the email escalates with drivers.police_record_reminder_count
 * (see policeRecordReminderTemplate).
 *
 * Auth: Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`.
 * When CRON_SECRET is configured we require it; otherwise anyone with
 * the URL could fire the daily blast.
 */

const REMINDER_INTERVAL_DAYS = 7;

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

  const nowIso = new Date().toISOString();
  const throttleCutoffIso = new Date(
    Date.now() - REMINDER_INTERVAL_DAYS * 86_400_000,
  ).toISOString();

  // Pool: every driver with an auth account, throttle satisfied. We
  // will then filter down to those actually missing the police record
  // (either no row in driver_documents, or the row has no file_path).
  const { data: candidates } = await supabase
    .from("drivers")
    .select(
      "id, user_id, first_name, last_name, email, police_record_reminder_sent_at, police_record_reminder_count",
    )
    .not("user_id", "is", null)
    // Either never reminded, or last reminded before the throttle cutoff.
    .or(
      `police_record_reminder_sent_at.is.null,police_record_reminder_sent_at.lt.${throttleCutoffIso}`,
    );

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  // Batch-load the police_record rows for all candidates so we don't
  // do N+1 lookups.
  const driverIds = candidates.map((c) => c.id);
  const { data: policeRows } = await supabase
    .from("driver_documents")
    .select("driver_id, file_path")
    .eq("doc_key", "police_record")
    .in("driver_id", driverIds);

  const uploadedDriverIds = new Set(
    (policeRows ?? [])
      .filter((r) => r.file_path && r.file_path.length > 0)
      .map((r) => r.driver_id),
  );

  const missing = candidates.filter((c) => !uploadedDriverIds.has(c.id));

  let sent = 0;
  const failures: string[] = [];

  for (const driver of missing) {
    const fullName =
      [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() ||
      null;
    const nextCount = (driver.police_record_reminder_count ?? 0) + 1;
    const uploadUrl = `${APP_URL}/driver/resubmit?doc=police_record`;

    // Email — needs a real address. driver.email may be blank if the
    // driver was created by an employer without one; skip those.
    if (driver.email) {
      try {
        await sendPoliceRecordReminderEmail(driver.email, {
          fullName,
          uploadUrl,
          reminderCount: nextCount,
        });
      } catch (err) {
        failures.push(`${driver.id}:email:${(err as Error).message}`);
        continue; // Don't advance the throttle if email failed — retry tomorrow.
      }
    }

    // Inbox row + push (best-effort) so the nudge shows up in-app too.
    if (driver.user_id) {
      await notifyDriver(supabase, {
        driverUserId: driver.user_id,
        kind: "verification",
        title: "Upload your police record",
        body: "Rajlo can't dispatch rides to you until your Good Conduct Certificate is on file.",
        href: "/driver/resubmit?doc=police_record",
        cta: "Upload now",
        pushTag: "police-record-reminder",
      }).catch(() => null);
    }

    // Advance throttle / count. If the email step above was skipped
    // (driver.email empty), we still update — otherwise the driver
    // gets an in-app nudge every cron pass, which is worse spam than
    // the email throttle.
    await supabase
      .from("drivers")
      .update({
        police_record_reminder_sent_at: nowIso,
        police_record_reminder_count: nextCount,
      })
      .eq("id", driver.id);

    sent += 1;
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    missing: missing.length,
    sent,
    failures: failures.length,
    failureDetails: failures.slice(0, 5),
  });
}
