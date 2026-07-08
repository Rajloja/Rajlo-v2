import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { creditWallet } from "@/lib/wallet";
import { verifyCallbackSignature } from "@/lib/wipay";

/**
 * GET / POST /api/wallet/deposit/callback
 *
 * Endpoint the payment gateway hits after a deposit succeeds OR
 * fails. Two callers in practice:
 *
 *   1. **WiPay's IPN webhook** (POST, server-to-server). Carries an
 *      HMAC signature header that we verify against WIPAY_API_KEY
 *      before trusting the payload.
 *
 *   2. **The user's browser** redirected here after the hosted
 *      checkout. We use this to land them back in the Rajlo app
 *      and either show "deposit confirmed" or "deposit failed".
 *      In stub mode the simulated redirect carries
 *      `?simulate=success` so the wallet UI works without real
 *      WiPay — clearly marked in src/lib/wipay.ts.
 *
 * Once we mark the `wallet_deposits` row as `completed`, we credit
 * the wallet via the helper. The DB trigger keeps the balance
 * cache + the ledger snapshot in lockstep.
 *
 * No user-auth check here — this endpoint is server-to-server (or
 * post-redirect from a third party) so we can't rely on the rider's
 * cookie. The deposit_id + signature are the credentials.
 */

async function handle(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const url = request.nextUrl;
  // Both query string (browser redirect) and POST body (IPN) work.
  // The query string is faster to parse so we check it first.
  const depositId =
    url.searchParams.get("deposit_id") ??
    url.searchParams.get("order_id") ??
    null;
  // The `simulate` flags are a STUB-MODE-ONLY convenience: they let
  // the wallet UI work end-to-end before a real gateway is wired.
  // They are honoured ONLY when WiPay credentials are absent. The
  // moment real credentials exist, an attacker can no longer credit a
  // pending deposit for free by appending `?simulate=success`.
  const stubMode = !process.env.WIPAY_API_KEY;
  const simulateSuccess =
    stubMode && url.searchParams.get("simulate") === "success";
  const simulateFailure =
    stubMode && url.searchParams.get("simulate") === "failure";

  if (!depositId) {
    return NextResponse.json({ error: "Missing deposit_id" }, { status: 400 });
  }

  // For real IPN POSTs from WiPay we'd parse the body and verify
  // the signature here. The verifier short-circuits to true in stub
  // mode (no API key configured).
  if (request.method === "POST") {
    const rawBody = await request.text();
    const sig = request.headers.get("x-wipay-signature");
    if (!verifyCallbackSignature(rawBody, sig)) {
      return NextResponse.json(
        { error: "Invalid gateway signature" },
        { status: 403 },
      );
    }
  }

  const { data: deposit } = await supabase
    .from("wallet_deposits")
    .select("id, user_id, amount_jmd, status")
    .eq("id", depositId)
    .maybeSingle();

  if (!deposit) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }

  // Idempotent: if the deposit is already completed or failed, just
  // bounce the user back. Real-world IPN webhooks retry on transient
  // errors, so we MUST tolerate seeing the same deposit twice.
  if (deposit.status !== "pending") {
    return redirectToWalletReturn(request, depositId, deposit.status);
  }

  const wantsSuccess =
    simulateSuccess ||
    (request.method === "POST" && !simulateFailure);

  if (wantsSuccess) {
    // Credit the wallet and mark the deposit completed in one go.
    const credit = await creditWallet(
      supabase,
      deposit.user_id,
      deposit.amount_jmd,
      "deposit",
      {
        depositId: deposit.id,
        description: `Wallet top-up · ${deposit.amount_jmd.toLocaleString(
          "en-JM",
        )} JMD`,
      },
    );

    if (!credit.ok) {
      // Couldn't credit — leave deposit pending so an admin can
      // investigate; bounce user with a soft error.
      return redirectToWalletReturn(
        request,
        depositId,
        "pending",
        credit.error,
      );
    }

    await supabase
      .from("wallet_deposits")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", deposit.id);

    return redirectToWalletReturn(request, depositId, "completed");
  }

  // Failure path — gateway said "no" or simulate=failure.
  await supabase
    .from("wallet_deposits")
    .update({ status: "failed" })
    .eq("id", deposit.id);

  return redirectToWalletReturn(request, depositId, "failed");
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

function redirectToWalletReturn(
  request: NextRequest,
  depositId: string,
  status: string,
  errorMsg?: string,
) {
  // After IPN POSTs we just return JSON for the gateway to ack;
  // browser-redirect callers (GET) get sent back into the app.
  if (request.method === "POST") {
    return NextResponse.json({ ok: true, status });
  }

  // Prefer the caller-supplied `return_to` (e.g. /rider/request with
  // trip params intact) so a rider who topped up mid-booking lands
  // right back where they were — the exact "faster booking" flow the
  // deposit sheet was built for. Fall back to /rider/wallet if it's
  // absent or turns out to be off-origin (validated by URL parsing
  // against the request origin, mirroring the deposit-start guard).
  const requestOrigin = new URL(request.url).origin;
  const rawReturnTo = request.nextUrl.searchParams.get("return_to");
  let target: URL;
  if (rawReturnTo) {
    try {
      const resolved = new URL(rawReturnTo, requestOrigin);
      target =
        resolved.origin === requestOrigin
          ? resolved
          : new URL("/rider/wallet", request.url);
    } catch {
      target = new URL("/rider/wallet", request.url);
    }
  } else {
    target = new URL("/rider/wallet", request.url);
  }

  // Success flag reads simply as `deposit=success` on the request page
  // (which is where the sheet was opened from). The wallet-page fall-
  // back still reads the legacy `deposit_status`/`deposit_id` params it
  // already knows about, so nothing over there breaks.
  target.searchParams.set("deposit_id", depositId);
  target.searchParams.set("deposit_status", status);
  target.searchParams.set(
    "deposit",
    status === "completed" ? "success" : status,
  );
  if (errorMsg) {
    target.searchParams.set("deposit_error", errorMsg.slice(0, 200));
  }
  return NextResponse.redirect(target);
}
