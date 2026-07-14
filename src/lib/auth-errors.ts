/**
 * Maps `?error=...` query params (set by /auth/callback when an email link
 * or OAuth handshake fails) to user-friendly messages shown on login
 * pages. Hides the technical PKCE / state-mismatch language Supabase
 * surfaces by default — those messages aren't actionable for end users.
 */
export function friendlyError(code: string | null): string | null {
  if (!code) return null;

  // Supabase PKCE / state errors all fall under one broad family —
  // "we lost your session between an external step (Google OAuth OR
  // an email confirmation link) and us". The fix is always the same
  // from the user's perspective: try again in the same browser.
  // Message is deliberately provider-neutral because email-confirm
  // flows hit the same code path and previously (mis)directed the
  // user to Google.
  const lower = code.toLowerCase();
  if (
    lower.includes("pkce") ||
    lower.includes("code verifier") ||
    lower.includes("invalid flow state") ||
    lower.includes("flow state has expired") ||
    lower.includes("state cookie") ||
    lower.includes("auth code")
  ) {
    return "Your sign-in session expired before we could finish. Try again in the same browser tab you started in, and don't close it until you're signed in.";
  }

  switch (code) {
    case "link_expired":
      return "That confirmation link has expired or already been used. Please sign up again or request a new link.";
    case "missing_code":
      return "We couldn't read the confirmation code in that link. Please request a fresh one.";
    case "auth_failed":
      return "We couldn't verify that link. Please try signing in or request a new confirmation email.";
    // Cross-portal sign-in: the email owns a different account type than
    // the page they signed in from (set by /auth/callback). We name the
    // account the email actually belongs to so they use the right app.
    case "account_is_driver":
      return "This email is registered to a Rajlo driver account. Please sign in from the driver app instead.";
    case "account_is_rider":
      return "This email is registered to a Rajlo rider account. Please sign in from the rider app instead.";
    case "account_is_admin":
      return "This email is registered to a Rajlo admin account.";
    default:
      // Fallback: surface Supabase's own error message verbatim
      return code;
  }
}

/**
 * Catches the "I signed up with Google, then tried to sign in with a
 * password" case and returns a helpful explanation pointing the user
 * at the Google button. Called from the login pages AFTER a failed
 * `signInWithPassword` so we don't leak account existence to crawlers
 * — only to someone who already typed the email + a wrong password.
 *
 * Returns `null` if the email isn't OAuth-only (so the caller falls
 * back to whatever message Supabase already gave us — usually the
 * generic "invalid login credentials").
 */
export async function detectOAuthOnlyEmail(
  email: string,
): Promise<string | null> {
  if (!email || !email.includes("@")) return null;
  try {
    const res = await fetch("/api/auth/check-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      exists?: boolean;
      providers?: string[];
    };
    if (!data?.exists) return null;
    const providers = data.providers ?? [];
    const hasEmail = providers.includes("email");
    const hasGoogle = providers.includes("google");
    if (!hasEmail && hasGoogle) {
      return "This email is registered with Google. Tap “Continue with Google” above to sign in — there's no password set on this account.";
    }
    if (!hasEmail && providers.length > 0) {
      // Any other OAuth-only provider (Apple etc.) — generic guidance.
      return `This email is registered via ${providers[0]}. Use that sign-in method instead.`;
    }
    return null;
  } catch {
    return null;
  }
}
