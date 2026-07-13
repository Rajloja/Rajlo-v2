import { NextResponse } from "next/server";
import { requiredTADocuments } from "@/lib/mock-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import type { OnboardingSubmitRequest } from "@/lib/api-types";
import { sendDriverOnboardingSubmittedEmail } from "@/lib/email-templates";

export async function POST(request: Request) {
  const body = (await request.json()) as OnboardingSubmitRequest;

  if (!body?.form?.firstName || !body?.form?.lastName) {
    return NextResponse.json(
      { error: "Missing required onboarding fields" },
      { status: 400 },
    );
  }

  // Identify the signed-in user from the session — that's the canonical
  // identity. The body.driverId is ignored (legacy from mock mode).
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      message: "Stored in mock mode. Add Supabase env vars to persist.",
    });
  }

  // Look up any existing driver record for this user (drivers.user_id)
  const { data: existing } = await supabase
    .from("drivers")
    .select("id, external_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const driverFields = {
    user_id: user.id,
    first_name: body.form.firstName,
    last_name: body.form.lastName,
    phone: body.form.phone,
    email: body.form.email,
    trn: body.form.trn,
    nis: body.form.nis,
    licence_number: body.form.licenceNumber,
    licence_expiry: body.form.licenceExpiry || null,
    badge_number: body.form.badgeNumber || null,
    plate_number: body.form.plateNumber,
    vehicle_type: body.form.vehicleType || null,
    vehicle_make: body.form.vehicleMake,
    vehicle_model: body.form.vehicleModel,
    vehicle_year: body.form.vehicleYear ? Number(body.form.vehicleYear) : null,
    vehicle_color: body.form.vehicleColor || null,
    franchise_number: body.form.franchiseNumber || null,
    franchise_expiry: body.form.franchiseExpiry || null,
    onboarding_status: "pending_review",
    activated: false,
    // Clear any admin note from a previous rejection — fresh review starts now.
    admin_note: null,
    // Timestamp the (re)submission so the pending screen can show an
    // accurate "X mins ago" instead of time since the row was first created.
    submitted_at: new Date().toISOString(),
  };

  let driverId: string;
  let externalId: string;
  const isResubmission = !!existing;

  if (existing) {
    // Resubmission — update in place. The auth-server's getDriverStatus()
    // returned `rejected`, otherwise the client-side gate would have blocked
    // the user from reaching this submit at all.
    const { data: updated, error: updateError } = await supabase
      .from("drivers")
      .update(driverFields)
      .eq("id", existing.id)
      .select("id, external_id")
      .single();
    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Failed to update driver profile" },
        { status: 500 },
      );
    }
    driverId = updated.id;
    externalId = updated.external_id;
  } else {
    // New driver — generate a short external_id (display id used in admin UI).
    externalId = `DRV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: created, error: insertError } = await supabase
      .from("drivers")
      .insert({ ...driverFields, external_id: externalId })
      .select("id")
      .single();
    if (insertError || !created) {
      return NextResponse.json(
        { error: "Failed to create driver profile" },
        { status: 500 },
      );
    }
    driverId = created.id;
  }

  // Per-doc reconciliation. The naive approach (upsert every row with
  // status="pending") would clobber an already-approved doc the driver didn't
  // touch. Instead we look at what's currently in the DB and decide what
  // actually changed:
  //
  //   - File path identical to existing → no-op (preserve approved status)
  //   - File path differs and existing was approved → flip to pending +
  //     stamp `previously_approved=true` so the admin sees a clear
  //     "was approved, re-uploaded" indicator
  //   - File path differs and existing was rejected/pending → flip to pending
  //     (standard resubmission)
  //   - No existing row + new upload → fresh insert, status pending
  //   - No existing row + no upload → insert as missing
  //   - Existing row, no upload → leave alone
  const uploadedById = new Map(body.uploadedDocs.map((d) => [d.id, d]));

  const { data: existingDocs } = await supabase
    .from("driver_documents")
    .select("doc_key, status, file_path, previously_approved")
    .eq("driver_id", driverId);
  const existingByKey = new Map(
    (existingDocs ?? []).map((d) => [d.doc_key, d]),
  );

  type DocRow = {
    driver_id: string;
    doc_key: string;
    label: string;
    description: string;
    renewal_period_days: number;
    expires_on: string | null;
    status: string;
    note: string;
    file_name: string | null;
    file_path: string | null;
    previously_approved: boolean;
  };
  const rowsToWrite: DocRow[] = [];

  for (const doc of requiredTADocuments) {
    const uploaded = uploadedById.get(doc.id);
    const existing = existingByKey.get(doc.id);
    const baseRow = {
      driver_id: driverId,
      doc_key: doc.id,
      label: doc.label,
      description: doc.description,
      renewal_period_days: doc.renewalPeriodDays,
      // Expiry date is unknown at onboarding time — the template's
      // mock `expiryDate` is example data for the marketing surfaces,
      // not a real driver expiry. Admin sets the actual date during
      // verification (or the driver supplies it when they renew).
      expires_on: null,
    };

    if (!existing) {
      // First-ever submission for this doc.
      rowsToWrite.push({
        ...baseRow,
        status: uploaded ? "pending" : "missing",
        note: uploaded ? "Submitted via onboarding flow" : "Not uploaded yet",
        file_name: uploaded?.fileName ?? null,
        file_path: uploaded?.filePath ?? null,
        previously_approved: false,
      });
      continue;
    }

    if (!uploaded) {
      // Driver didn't include this doc in the resubmission — leave the
      // existing row alone.
      continue;
    }

    if (uploaded.filePath === existing.file_path) {
      // File unchanged. Don't touch the row at all — preserves an existing
      // "approved" status without round-tripping it.
      continue;
    }

    // File replaced.
    const wasApproved = existing.status === "approved";
    rowsToWrite.push({
      ...baseRow,
      status: "pending",
      note: wasApproved
        ? "Replaced by driver after admin approval — needs re-review"
        : "Resubmitted via onboarding flow",
      file_name: uploaded.fileName,
      file_path: uploaded.filePath ?? null,
      previously_approved: wasApproved || existing.previously_approved === true,
    });
  }

  if (rowsToWrite.length > 0) {
    const { error: docsError } = await supabase
      .from("driver_documents")
      .upsert(rowsToWrite, { onConflict: "driver_id,doc_key" });

    if (docsError) {
      return NextResponse.json(
        { error: "Failed to upsert driver documents" },
        { status: 500 },
      );
    }
  }

  // Payout method — save the driver's bank details captured on step 7.
  // Same validation surface as PUT /api/driver/payout-method so we
  // reject the same shapes here (garbage account numbers, missing
  // fields). On resubmission we overwrite whatever the driver saved
  // last time so an edit on the review screen actually sticks. Not
  // fatal to the submission overall — the driver row + docs already
  // landed. A payout-method failure surfaces as a non-blocking log +
  // an admin-note flag so ops can chase the driver for correction
  // instead of losing the whole application.
  const payoutBankName = body.form.payoutBankName?.trim() ?? "";
  const payoutBranch = body.form.payoutBranch?.trim() ?? "";
  const payoutAccountNumber = body.form.payoutAccountNumber?.trim() ?? "";
  const payoutAccountHolderName =
    body.form.payoutAccountHolderName?.trim() ?? "";
  const payoutRoutingNumber = body.form.payoutRoutingNumber?.trim() ?? "";
  const payoutAccountType =
    body.form.payoutAccountType === "chequing" ? "chequing" : "savings";

  if (
    payoutBankName &&
    payoutBranch &&
    payoutAccountNumber &&
    payoutAccountHolderName &&
    // Mirror the /api/driver/payout-method PUT validator so we don't
    // silently accept a bogus number that the admin would only catch at
    // the weekly bank-batch CSV export.
    /^[0-9\- ]{6,24}$/.test(payoutAccountNumber)
  ) {
    const payoutRow = {
      user_id: user.id,
      bank_name: payoutBankName,
      branch: payoutBranch,
      account_number: payoutAccountNumber,
      account_holder_name: payoutAccountHolderName,
      account_type: payoutAccountType,
      routing_number: payoutRoutingNumber || null,
    };
    const { data: existingPayout } = await supabase
      .from("payout_methods")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error: payoutErr } = existingPayout
      ? await supabase
          .from("payout_methods")
          .update(payoutRow)
          .eq("id", existingPayout.id)
      : await supabase.from("payout_methods").insert(payoutRow);

    if (payoutErr) {
      console.error(
        "Driver onboarding payout-method upsert failed:",
        payoutErr.message,
      );
      // Non-fatal — flag it on the driver's admin_note so ops sees it
      // in the verification queue and can request the correction.
      await supabase
        .from("drivers")
        .update({
          admin_note: `Payout method save failed at onboarding: ${payoutErr.message.slice(0, 200)}. Ask driver to re-enter bank details before approval.`,
        })
        .eq("id", driverId);
    }
  } else if (
    payoutBankName ||
    payoutBranch ||
    payoutAccountNumber ||
    payoutAccountHolderName
  ) {
    // Partial payout data — some fields filled, some blank, or account
    // number failed the format check. Don't upsert (would create an
    // unusable half-record) but flag it so the admin knows to chase.
    await supabase
      .from("drivers")
      .update({
        admin_note:
          "Payout method incomplete — driver started but didn't fill in every required field (bank name / branch / account number / account holder name), or account number failed validation. Ask them to complete this before approval.",
      })
      .eq("id", driverId);
  }

  // Sync the user's profile display name to the name they typed on
  // the onboarding form. Drivers who signed up via Google OAuth have
  // their full_name pre-populated from their Google account, but the
  // TA-badge name (what they typed here) is what should appear on
  // their account, what riders see in chat, and what shows up across
  // every admin surface. Same name across the app, no surprises.
  //
  // We use service-role here so RLS can't block the write. The user's
  // own RLS policy lets them PATCH their own profile via /api/me, but
  // they don't necessarily have a session refresh after this submit
  // either way it's a server-internal sync, not a user action.
  const trimmedFirst = body.form.firstName.trim();
  const trimmedLast = body.form.lastName.trim();
  const composedName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");
  if (composedName) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: composedName })
      .eq("id", user.id);
    if (profileError) {
      // Non-fatal — the driver row + docs were saved successfully and
      // the admin queue will still surface them. Log so we can spot
      // a pattern of failures.
      console.error("Profile name sync failed:", profileError.message);
    }
  }

  // Audit trail
  await supabase.from("driver_audit_logs").insert({
    driver_id: driverId,
    actor_role: "driver",
    actor_id: externalId,
    event: isResubmission
      ? "Driver resubmitted documents after rejection"
      : "Onboarding submitted for TA verification",
  });

  // Send a confirmation email so the driver knows the submission landed
  // and roughly when to expect a decision. Best-effort — never fail the
  // submission on email delivery.
  if (body.form.email) {
    void sendDriverOnboardingSubmittedEmail(body.form.email, {
      driverName: `${body.form.firstName} ${body.form.lastName}`.trim(),
      externalId,
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, source: "supabase", externalId });
}
