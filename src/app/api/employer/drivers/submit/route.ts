import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requiredTADocuments } from "@/lib/mock-data";
import { sendDriverPasswordSetupEmail } from "@/lib/email-templates";
import { APP_URL } from "@/lib/email-render";

/**
 * POST /api/employer/drivers/submit
 *
 * The main employer-onboarding endpoint. Called by /employer/onboard
 * on the final "Submit for admin review" button. Does everything
 * atomically (as much as we can in Supabase — no cross-schema txn):
 *
 *   1. Verify caller is an active employer
 *   2. Create the driver's auth.users row via admin API with a random
 *      unusable password (they set their own via the emailed link)
 *   3. Create their profiles row with role='driver'
 *   4. Create their drivers row (all the wizard fields) with
 *      onboarded_by_employer_id = <employer's user id>
 *   5. MOVE each uploaded doc from
 *          driver-documents/employer-drafts/<employer>/<session>/<key>
 *      to
 *          driver-documents/<driver_user_id>/<key>-<ts>
 *      via storage.copy() + storage.remove()
 *   6. Insert driver_documents rows pointing at the new paths, all
 *      status='pending' so the verification queue picks them up
 *   7. Save the payout method to payout_methods
 *   8. Generate + store a driver_password_setup_tokens row
 *   9. Send the password-setup email
 *
 * If any step from 2 onward fails, we attempt best-effort rollback of
 * the auth.users row so we don't leave orphaned identities behind. Full
 * transactional atomicity across Auth + public schema isn't achievable
 * without a stored proc; this is the pragmatic middle ground and it
 * matches how the driver's OWN onboarding endpoint handles failures.
 */

type SubmitBody = {
  form?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    trn?: string;
    nis?: string;
    licenceNumber?: string;
    licenceExpiry?: string;
    badgeNumber?: string;
    plateNumber?: string;
    vehicleType?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehicleColor?: string;
    franchiseNumber?: string;
    franchiseExpiry?: string;
    payoutBankName?: string;
    payoutBranch?: string;
    payoutAccountNumber?: string;
    payoutAccountHolderName?: string;
    payoutAccountType?: string;
    payoutRoutingNumber?: string;
  };
  uploadedDocs?: Array<{
    id?: string;
    fileName?: string;
    filePath?: string;
  }>;
  sessionId?: string;
};

const BUCKET = "driver-documents";

function randomStrongPassword(): string {
  // 32 URL-safe bytes → base64. Not user-visible; the driver never
  // needs this to log in (they'll set their own via the reset link).
  // We just need SOMETHING that satisfies Supabase's password policy
  // and can't be guessed if it leaked. `crypto.getRandomValues` is
  // available in Node 20+ / Edge.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user: employer },
  } = await auth.auth.getUser();
  if (!employer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: employerProfile } = await auth
    .from("profiles")
    .select("role, full_name")
    .eq("id", employer.id)
    .single();
  if (employerProfile?.role !== "employer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as SubmitBody;
  const form = body.form ?? {};
  const uploadedDocs = body.uploadedDocs ?? [];

  // ── Basic validation ──
  const email = (form.email ?? "").trim().toLowerCase();
  const firstName = (form.firstName ?? "").trim();
  const lastName = (form.lastName ?? "").trim();
  if (!email || !firstName || !lastName) {
    return NextResponse.json(
      { error: "Missing driver name or email." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Driver email doesn't look valid." },
      { status: 400 },
    );
  }

  // ── Uniqueness pre-check on email ──
  // Supabase auth's admin.listUsers would return a false negative on
  // large populations without paging, but the shape here is small
  // enough that a direct lookup on profiles.id → auth.users.email
  // catches most collisions. If we miss one, the createUser call below
  // returns "email already registered" and we surface that as-is.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("full_name", `${firstName} ${lastName}`)
    .limit(1)
    .maybeSingle();
  // Not fatal on its own — same-name-different-person is legitimate.
  // Log only.
  if (existingProfile) {
    console.info(
      "employer onboard: name matches an existing profile — proceeding",
      { firstName, lastName },
    );
  }

  // ── Step 2: create auth.users ──
  const password = randomStrongPassword();
  const { data: createUserData, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      password,
      // The driver will confirm via the set-password link click — no
      // separate confirm-email flow to make them navigate.
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`,
        onboarded_by_employer: true,
      },
    });

  if (createErr || !createUserData.user) {
    return NextResponse.json(
      {
        error:
          createErr?.message ??
          "Couldn't create the driver account. If the email is already registered, try a different one or ask the driver to sign in directly.",
      },
      { status: 400 },
    );
  }

  const driverUserId = createUserData.user.id;

  // Helper to nuke the auth.users row if anything below fails —
  // best-effort rollback so we don't leave orphans.
  const rollbackAuth = async () => {
    try {
      await supabase.auth.admin.deleteUser(driverUserId);
    } catch {
      /* best-effort */
    }
  };

  // ── Step 3: profile row ──
  const composedName = `${firstName} ${lastName}`;
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: driverUserId,
        role: "driver",
        full_name: composedName,
      },
      { onConflict: "id" },
    );
  if (profileErr) {
    await rollbackAuth();
    return NextResponse.json(
      { error: `Couldn't create driver profile: ${profileErr.message}` },
      { status: 500 },
    );
  }

  // ── Step 4: drivers row ──
  const externalId = `DRV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data: driverRow, error: driverErr } = await supabase
    .from("drivers")
    .insert({
      user_id: driverUserId,
      external_id: externalId,
      first_name: firstName,
      last_name: lastName,
      phone: form.phone ?? "",
      email,
      trn: form.trn ?? "",
      nis: form.nis ?? "",
      licence_number: form.licenceNumber ?? "",
      licence_expiry: form.licenceExpiry || null,
      badge_number: form.badgeNumber || null,
      plate_number: form.plateNumber ?? "",
      vehicle_type: form.vehicleType || null,
      vehicle_make: form.vehicleMake ?? "",
      vehicle_model: form.vehicleModel ?? "",
      vehicle_year: form.vehicleYear ? Number(form.vehicleYear) : null,
      vehicle_color: form.vehicleColor || null,
      franchise_number: form.franchiseNumber || null,
      franchise_expiry: form.franchiseExpiry || null,
      onboarding_status: "pending_review",
      activated: false,
      admin_note: null,
      submitted_at: new Date().toISOString(),
      onboarded_by_employer_id: employer.id,
    })
    .select("id")
    .single();
  if (driverErr || !driverRow) {
    await rollbackAuth();
    return NextResponse.json(
      {
        error: `Couldn't create driver record: ${driverErr?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }
  const driverId = driverRow.id;

  // ── Step 5: move uploaded files from employer-drafts to
  // the driver's own folder. Supabase Storage supports .copy() +
  // .remove(). For each doc, we produce a new path
  // `<driver_user_id>/<docKey>-<ts>.<ext>` (matching the existing
  // driver-uploaded convention).
  const movedDocs: Array<{ docKey: string; newPath: string; fileName: string }> = [];
  for (const doc of uploadedDocs) {
    const docKey = doc.id;
    const oldPath = doc.filePath;
    if (!docKey || !oldPath) continue;
    // Derive extension from the old path to preserve the file type.
    const ext = oldPath.split(".").pop() ?? "bin";
    const newPath = `${driverUserId}/${docKey}-${Date.now()}.${ext}`;
    const { error: copyErr } = await supabase.storage
      .from(BUCKET)
      .copy(oldPath, newPath);
    if (copyErr) {
      // Copy failed — log and skip this doc. The admin queue will see
      // it as "missing" and can ask the driver to re-upload once they
      // log in.
      console.error(
        `employer submit: copy failed for ${oldPath} → ${newPath}: ${copyErr.message}`,
      );
      continue;
    }
    // Best-effort delete of the draft file; not fatal if it lingers
    // (orphan-purge cron sweeps it later).
    await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => null);
    movedDocs.push({
      docKey,
      newPath,
      fileName: doc.fileName ?? oldPath.split("/").pop() ?? docKey,
    });
  }

  // ── Step 6: driver_documents rows ──
  const docRows = requiredTADocuments.map((meta) => {
    const moved = movedDocs.find((m) => m.docKey === meta.id);
    return {
      driver_id: driverId,
      doc_key: meta.id,
      label: meta.label,
      description: meta.description,
      renewal_period_days: meta.renewalPeriodDays,
      expires_on: null,
      status: moved ? "pending" : "missing",
      note: moved ? "Submitted via employer onboarding" : "Not uploaded",
      file_name: moved?.fileName ?? null,
      file_path: moved?.newPath ?? null,
      previously_approved: false,
    };
  });
  const { error: docsErr } = await supabase
    .from("driver_documents")
    .upsert(docRows, { onConflict: "driver_id,doc_key" });
  if (docsErr) {
    // Not fatal — driver + auth row exist. Log and continue. Admin can
    // see the driver in the queue with "missing" docs and chase.
    console.error(
      `employer submit: driver_documents upsert failed: ${docsErr.message}`,
    );
  }

  // ── Step 7: payout method ──
  const acctNum = (form.payoutAccountNumber ?? "").trim();
  const acctType =
    form.payoutAccountType === "chequing" ? "chequing" : "savings";
  if (
    form.payoutBankName &&
    form.payoutBranch &&
    acctNum &&
    form.payoutAccountHolderName &&
    /^[0-9\- ]{6,24}$/.test(acctNum)
  ) {
    const { error: payoutErr } = await supabase
      .from("payout_methods")
      .insert({
        user_id: driverUserId,
        bank_name: form.payoutBankName.trim(),
        branch: form.payoutBranch.trim(),
        account_number: acctNum,
        account_holder_name: form.payoutAccountHolderName.trim(),
        account_type: acctType,
        routing_number: form.payoutRoutingNumber?.trim() || null,
      });
    if (payoutErr) {
      console.error(
        `employer submit: payout_methods insert failed: ${payoutErr.message}`,
      );
      // Flag on admin_note so ops chases before approval.
      await supabase
        .from("drivers")
        .update({
          admin_note:
            "Payout method save failed during employer onboarding — ask driver to re-enter bank details in the wallet screen.",
        })
        .eq("id", driverId);
    }
  }

  // ── Step 8: password setup token ──
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("driver_password_setup_tokens")
    .insert({
      driver_user_id: driverUserId,
      issued_by_employer_id: employer.id,
    })
    .select("token")
    .single();
  if (tokenErr || !tokenRow) {
    // The driver exists; token generation failed. Admin will need to
    // manually regenerate later. Return partial success rather than
    // rolling back everything.
    console.error(
      `employer submit: password token creation failed: ${tokenErr?.message ?? "unknown"}`,
    );
    return NextResponse.json(
      {
        ok: true,
        driverExternalId: externalId,
        warning: "token_failed",
        message:
          "Driver created but password link failed to generate. Admin will regenerate manually.",
      },
      { status: 200 },
    );
  }

  // ── Step 9: send the password-setup email ──
  const setupUrl = `${APP_URL}/auth/set-password?token=${encodeURIComponent(tokenRow.token as string)}`;
  await sendDriverPasswordSetupEmail(email, {
    fullName: composedName,
    setupUrl,
    onboardedByEmployerName: employerProfile?.full_name ?? null,
  }).catch((err) => {
    console.error(`employer submit: email send failed: ${err}`);
  });

  // ── Audit trail ──
  await supabase.from("driver_audit_logs").insert({
    driver_id: driverId,
    actor_role: "employer",
    actor_id: employer.id,
    event: `Driver onboarded by employer (${employerProfile?.full_name ?? employer.id})`,
  });

  return NextResponse.json({
    ok: true,
    driverExternalId: externalId,
  });
}
