import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  sendDriverApprovedEmail,
  sendDriverRejectedEmail,
} from "@/lib/driver-emails";
import { notifyDriver } from "@/lib/notify";
import { resolveDriverEmail } from "@/lib/driver-email-resolver";
import type { AdminDecisionRequest } from "@/lib/api-types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidFutureIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ts = new Date(`${value}T00:00:00Z`).getTime();
  if (Number.isNaN(ts)) return false;
  // Same 24-hour grace as the driver-side validators so the admin can
  // type the date as printed on the document even if it's already today.
  return ts >= Date.now() - 24 * 60 * 60 * 1000;
}

export async function POST(request: Request) {
  // Admin-only
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as AdminDecisionRequest;

  if (!body?.driverId || !Array.isArray(body.docs)) {
    return NextResponse.json({ error: "Invalid admin decision payload" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      message: "Decision accepted in mock mode. Add Supabase env vars to persist.",
    });
  }

  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("id, external_id, first_name, last_name, email, user_id")
    .eq("external_id", body.driverId)
    .single();

  if (driverError || !driver) {
    return NextResponse.json({ error: "Driver record not found" }, { status: 404 });
  }

  // Pull current rows so we know each doc's renewal_period_days. Drives
  // whether `expiresOn` is mandatory on approval.
  const docKeys = body.docs.map((d) => d.id);
  const { data: existingRows } = await supabase
    .from("driver_documents")
    .select("doc_key, renewal_period_days")
    .eq("driver_id", driver.id)
    .in("doc_key", docKeys);
  const renewalByKey = new Map(
    ((existingRows ?? []) as Array<{
      doc_key: string;
      renewal_period_days: number | null;
    }>).map((r) => [r.doc_key, r.renewal_period_days ?? 0]),
  );

  // Update documents one-at-a-time using `update().eq()` instead of upsert.
  // Upsert was attempting INSERTs when its conflict resolution didn't match,
  // which violated the NOT NULL constraints on `label`/`description` (those
  // get set during onboarding submission, not here). UPDATE-only is the
  // correct semantic anyway: admin decisions only mutate existing rows.
  for (const doc of body.docs) {
    const targetStatus = doc.status === "resubmit" ? "rejected" : doc.status;
    const renewalPeriod = renewalByKey.get(doc.id) ?? 0;

    // Resolve the expiry write:
    //   - undefined: don't touch the column
    //   - null/"":   clear (only valid for non-renewing docs)
    //   - string:    validate + use
    let expiresUpdate: { expires_on: string | null } | null = null;
    if (doc.expiresOn !== undefined) {
      if (doc.expiresOn === null || doc.expiresOn === "") {
        if (renewalPeriod > 0 && targetStatus === "approved") {
          return NextResponse.json(
            { error: `Expiry date is required to approve ${doc.id}.` },
            { status: 400 },
          );
        }
        expiresUpdate = { expires_on: null };
      } else if (typeof doc.expiresOn === "string") {
        if (!isValidFutureIsoDate(doc.expiresOn)) {
          return NextResponse.json(
            {
              error: `Expiry date for ${doc.id} must be a valid future YYYY-MM-DD.`,
            },
            { status: 400 },
          );
        }
        expiresUpdate = { expires_on: doc.expiresOn };
      } else {
        return NextResponse.json(
          { error: `Expiry date for ${doc.id} must be a string or null.` },
          { status: 400 },
        );
      }
    }

    // Clear `previously_approved` once the admin re-approves — it's purely
    // an "attention needed" marker for pending docs that came from a prior
    // approval. After re-approval the doc is back to a clean approved state.
    const updateFields: Record<string, unknown> = {
      status: targetStatus,
      note: doc.note || null,
      reviewed_by: "admin-web",
      reviewed_at: new Date().toISOString(),
      ...(expiresUpdate ?? {}),
    };
    if (targetStatus === "approved") {
      updateFields.previously_approved = false;
    }
    const { error: updateError } = await supabase
      .from("driver_documents")
      .update(updateFields)
      .eq("driver_id", driver.id)
      .eq("doc_key", doc.id);
    if (updateError) {
      return NextResponse.json(
        {
          error: `Failed to update document ${doc.id}: ${updateError.message}`,
          details: updateError,
        },
        { status: 500 },
      );
    }
  }

  // Zero-docs guard. `[].every(...)` returns TRUE in JS — meaning a
  // decision request that passed an empty docs array would satisfy
  // `allApproved` and, if the admin also had activateDriver=true
  // checked, flip the driver's activated flag on WITHOUT any actual
  // verification. Requiring at least one doc row makes the check
  // honest. Real reviews always have every required TA doc in the
  // array (the client builds it from driver_documents); this guard
  // catches malformed / probing requests + a UI regression that
  // dropped the docs before submit.
  const allApproved =
    body.docs.length > 0 && body.docs.every((d) => d.status === "approved");

  const willActivate = body.activateDriver && allApproved;
  const { error: driverUpdateError } = await supabase
    .from("drivers")
    .update({
      activated: willActivate,
      onboarding_status: allApproved ? "approved" : "rejected",
      admin_note: body.adminNote || null,
      // Clear the deactivation marker when the driver is being re-activated.
      // Otherwise leave it alone — a partial decision (some docs still
      // rejected) on a previously-deactivated driver should keep them in the
      // deactivated state until everything is approved.
      ...(willActivate ? { deactivated_at: null } : {}),
    })
    .eq("id", driver.id);

  if (driverUpdateError) {
    return NextResponse.json(
      {
        error: `Failed to update driver: ${driverUpdateError.message}`,
        details: driverUpdateError,
      },
      { status: 500 },
    );
  }

  const { error: auditError } = await supabase.from("driver_audit_logs").insert({
    driver_id: driver.id,
    actor_role: "admin",
    actor_id: "admin-web",
    event: allApproved
      ? "Verification approved; driver activated"
      : "Verification reviewed; corrections requested",
  });

  if (auditError) {
    return NextResponse.json(
      {
        error: `Failed to write audit log: ${auditError.message}`,
        details: auditError,
      },
      { status: 500 },
    );
  }

  // Send notification email to the driver. Failure here doesn't block the
  // decision — the DB state is already updated; we just log a warning so
  // the admin can be told the email may not have gone out.
  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  let emailError: string | null = null;
  // Resolve the driver's email through the multi-source helper —
  // covers OAuth signups + legacy rows where drivers.email is null.
  const targetEmail = await resolveDriverEmail(supabase, driver);
  if (targetEmail) {
    const driverName =
      [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
      "driver";
    const result = allApproved
      ? await sendDriverApprovedEmail({
          to: targetEmail,
          driverName,
          externalId: driver.external_id,
        })
      : await sendDriverRejectedEmail({
          to: targetEmail,
          driverName,
          externalId: driver.external_id,
          adminNote: body.adminNote || null,
        });

    if (result.ok) {
      emailStatus = "sent";
    } else if ("skipped" in result) {
      emailStatus = "skipped";
    } else {
      emailStatus = "failed";
      emailError = result.error;
    }
  }

  // Inbox row + web push. Best-effort.
  if (driver.user_id) {
    const driverFirst = (driver.first_name ?? "").trim().split(/\s+/)[0] || "Driver";
    void notifyDriver(supabase, {
      driverUserId: driver.user_id,
      kind: "verification",
      title: allApproved
        ? `You're approved, ${driverFirst}!`
        : "Action needed on your application",
      body: allApproved
        ? `Driver ID ${driver.external_id} is now active. Tap to start accepting rides.`
        : (body.adminNote?.slice(0, 140) ??
          "Open the driver portal to resubmit the flagged documents."),
      href: allApproved ? "/driver" : "/driver/resubmit",
      cta: allApproved ? "Open dashboard" : "Resubmit documents",
      pushTag: `driver-verification-${driver.external_id}`,
      pushRenotify: true,
    });
  }

  return NextResponse.json({
    ok: true,
    source: "supabase",
    email: { status: emailStatus, error: emailError },
  });
}
