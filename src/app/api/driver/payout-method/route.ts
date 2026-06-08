import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET  /api/driver/payout-method — return the driver's saved bank
 *                                  account for payouts (or null).
 * PUT  /api/driver/payout-method — upsert: create on first save,
 *                                  edit on subsequent calls. There's
 *                                  exactly one method per driver
 *                                  (DB-level unique constraint).
 *
 * Locked to the `driver` role. The schema is enforced by the unique
 * constraint on payout_methods.user_id, so the upsert collapses to
 * either an insert (first time) or an update (subsequent).
 *
 * Snapshot rule: editing the method does NOT retroactively rewrite
 * in-flight payout rows — see the snapshot_payout_method() trigger in
 * payouts-migration.sql which copies the method onto each
 * wallet_withdrawals row at request time.
 */

type Body = {
  bankName?: unknown;
  branch?: unknown;
  accountNumber?: unknown;
  accountHolderName?: unknown;
  accountType?: unknown;
  routingNumber?: unknown;
};

export async function GET() {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const { data } = await supabase
    .from("payout_methods")
    .select(
      "id, bank_name, branch, account_number, account_holder_name, account_type, routing_number, updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ method: data ?? null });
}

export async function PUT(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // Driver-only (riders don't need a payout method — they don't earn).
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "driver") {
    return NextResponse.json(
      { error: "Only drivers can save a payout method." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const bankName = str(body.bankName);
  const branch = str(body.branch);
  const accountNumber = str(body.accountNumber);
  const accountHolderName = str(body.accountHolderName);
  const accountType = str(body.accountType);
  const routingNumber = str(body.routingNumber);

  if (!bankName || !branch || !accountNumber || !accountHolderName) {
    return NextResponse.json(
      {
        error:
          "Bank name, branch, account number, and account holder name are required.",
      },
      { status: 400 },
    );
  }
  if (accountType !== "savings" && accountType !== "chequing") {
    return NextResponse.json(
      { error: "Account type must be 'savings' or 'chequing'." },
      { status: 400 },
    );
  }
  // Jamaican account numbers are typically 8-14 digits. We accept
  // 6-20 digits/dashes to be generous (credit unions vary). Reject
  // obvious garbage to surface typos at save-time rather than at the
  // batch CSV download (where a bad number would fail with the bank).
  if (!/^[0-9\- ]{6,24}$/.test(accountNumber)) {
    return NextResponse.json(
      { error: "Account number looks off — it should be 6–20 digits." },
      { status: 400 },
    );
  }

  // Upsert by user_id (unique constraint). If a row exists we update;
  // otherwise insert.
  const { data: existing } = await supabase
    .from("payout_methods")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("payout_methods")
      .update({
        bank_name: bankName,
        branch,
        account_number: accountNumber,
        account_holder_name: accountHolderName,
        account_type: accountType,
        routing_number: routingNumber || null,
      })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: existing.id, updated: true });
  }

  const { data: created, error: insertError } = await supabase
    .from("payout_methods")
    .insert({
      user_id: user.id,
      bank_name: bankName,
      branch,
      account_number: accountNumber,
      account_holder_name: accountHolderName,
      account_type: accountType,
      routing_number: routingNumber || null,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message ?? "Couldn't save payout method." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: created.id, created: true });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
