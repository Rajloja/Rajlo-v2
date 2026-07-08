/**
 * WiPay payment-gateway adapter.
 *
 * STATUS: SCAFFOLD ONLY. The function shapes match WiPay's hosted-
 * checkout flow (https://wipayfinancial.com — see `Plugins → API`)
 * so swapping in real credentials is a one-file change. Until that
 * happens, `initiateDeposit` returns a placeholder URL routed back
 * through our own `/api/wallet/deposit/callback?simulate=success`
 * so the rest of the wallet UI can be built + demoed end-to-end.
 *
 * To go live:
 *   1. Sign up for a WiPay merchant account and grab the API key
 *      + account number from the merchant dashboard.
 *   2. Set env vars:
 *        WIPAY_API_KEY
 *        WIPAY_ACCOUNT_NUMBER
 *        WIPAY_ENVIRONMENT="sandbox" | "live"
 *   3. Replace the body of `initiateDeposit` with a POST to WiPay's
 *      checkout endpoint. The shape returned by them includes a
 *      `url` field — return that directly as `redirectUrl`.
 *   4. Wire the IPN webhook URL in your WiPay merchant settings to:
 *        https://<your-domain>/api/wallet/deposit/callback
 *      Implement the IPN signature verification in
 *      `verifyCallbackSignature` (WiPay sends an HMAC header).
 *
 * The rest of the codebase doesn't need changes — the wallet ledger,
 * deposit page, and admin views all stay the same.
 */

export type InitiateDepositArgs = {
  /** Internal wallet_deposits.id — passed back via the gateway so
   *  the callback can reconcile. */
  depositId: string;
  /** Amount in JMD whole units (no cents). */
  amountJmd: number;
  /** Email shown on WiPay's hosted page + emailed receipts to. */
  email: string;
  /** Shown on the receipt as "from". Used for fraud screening too. */
  customerName: string;
  /** Origin (https://app.rajlo.com) — used to build the return URL. */
  origin: string;
  /** Where the user should land AFTER the callback completes. Piggy-
   *  backed onto the return_url as `?return_to=<encoded>` so the
   *  callback can bounce them straight back to the surface they
   *  started from (e.g. /rider/request with trip context intact)
   *  rather than the wallet page. Only same-origin paths are honoured
   *  — the deposit API validates before passing it in. */
  returnTo?: string | null;
};

export type InitiateDepositResult =
  | { ok: true; redirectUrl: string; gatewayReference: string }
  | { ok: false; error: string };

export async function initiateDeposit(
  args: InitiateDepositArgs,
): Promise<InitiateDepositResult> {
  const apiKey = process.env.WIPAY_API_KEY;
  const accountNumber = process.env.WIPAY_ACCOUNT_NUMBER;

  // ─── STUB ───
  // No credentials → return a self-loop URL that hits our own
  // callback with ?simulate=success. The deposit will land in the
  // user's wallet exactly as if WiPay had paid out, so the wallet
  // UI works end-to-end during dev / demo.
  if (!apiKey || !accountNumber) {
    const cb = new URL(`${args.origin}/api/wallet/deposit/callback`);
    cb.searchParams.set("deposit_id", args.depositId);
    cb.searchParams.set("simulate", "success");
    if (args.returnTo) cb.searchParams.set("return_to", args.returnTo);
    return {
      ok: true,
      redirectUrl: cb.toString(),
      gatewayReference: `stub-${args.depositId}`,
    };
  }

  // ─── REAL INTEGRATION ───
  // When WIPAY_API_KEY + WIPAY_ACCOUNT_NUMBER are set, replace the
  // following with a POST to WiPay's hosted-checkout endpoint. The
  // expected shape is roughly:
  //
  //   POST https://{env}.wipayfinancial.com/plugins/payments/request
  //     account_number=<>
  //     api_key=<>
  //     order_id=<args.depositId>
  //     total=<args.amountJmd>.00
  //     email=<args.email>
  //     name=<args.customerName>
  //     country_code=JM
  //     currency=JMD
  //     environment=<sandbox|live>
  //     return_url=<args.origin>/api/wallet/deposit/callback
  //
  // Response is JSON with { url, transaction_id }. Return them.
  return {
    ok: false,
    error:
      "WiPay credentials are set but the integration call isn't implemented yet — see comment in src/lib/wipay.ts.",
  };
}

/**
 * Verify the signature WiPay attaches to its IPN callback — replace
 * with their actual scheme (HMAC SHA-256 over the body, header name
 * varies by WiPay version) before going live. For now the stub
 * accepts everything because the simulated callback comes from the
 * same origin via the redirect URL above.
 */
export function verifyCallbackSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!process.env.WIPAY_API_KEY) return true; // stub mode
  // TODO: real HMAC verification against process.env.WIPAY_API_KEY.
  // Reference the args so ESLint doesn't flag them as unused while
  // we have the real implementation slated.
  void rawBody;
  void signatureHeader;
  return true;
}
