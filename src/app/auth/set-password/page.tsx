"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
} from "@/components/auth-shell";

/**
 * /auth/set-password?token=<uuid>
 *
 * The landing page a freshly-onboarded driver arrives on after clicking
 * the link Rajlo emailed them. The link contains a one-time token
 * issued by the employer-submission endpoint. This page:
 *
 *   1. Calls GET /api/auth/set-password/verify?token=... to check the
 *      token is still valid (not consumed, not superseded, not >365d).
 *   2. Shows a "set your password" form with basic strength gating.
 *   3. On submit, POSTs the token + new password to
 *      /api/auth/set-password, which updates the driver's auth.users
 *      password + flags the token consumed + optionally auto-signs
 *      them in.
 *   4. On success, redirects to /driver (their portal). If the driver
 *      hits this link without a token (e.g. an SEO crawl or clicking
 *      the reused login page), we render a friendly "check your email"
 *      message.
 */
export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenReason, setTokenReason] = useState<string | null>(null);
  const [driverEmail, setDriverEmail] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setTokenReason("No token in the link — check your email for the correct address.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/set-password/verify?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => ({}))) as {
          valid?: boolean;
          reason?: string;
          driverEmail?: string;
        };
        setTokenValid(Boolean(json.valid));
        setTokenReason(json.reason ?? null);
        setDriverEmail(json.driverEmail ?? null);
      } catch {
        setTokenValid(false);
        setTokenReason("Couldn't check the link. Try again or ask the Rajlo team to resend.");
      } finally {
        setVerifying(false);
      }
    })();
  }, [token]);

  const passwordOk = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = tokenValid && passwordOk && matches && !submitting;

  const submit = async () => {
    if (!canSubmit || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Server returned ${res.status}`);
      // Redirect to driver portal. The server auto-signs them in via
      // the response cookies.
      router.push("/driver");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set your password.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Set your Rajlo password"
      subtitle={
        driverEmail
          ? `for ${driverEmail}`
          : "one last step before you can drive"
      }
      audience="driver"
    >
      {verifying ? (
        <div className="flex items-center justify-center py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-rajlo-red border-t-transparent" />
        </div>
      ) : !tokenValid ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {tokenReason ??
              "This password link isn't valid anymore. It may have already been used or replaced."}
          </div>
          <p className="text-sm text-muted">
            Ask the Rajlo employee who onboarded you to have Rajlo admin
            regenerate the link — it takes them 30 seconds. Or, if you
            already set your password from a different device, just{" "}
            <Link
              href="/auth/driver/login"
              className="font-semibold text-rajlo-red hover:underline"
            >
              sign in here
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
              {error}
            </div>
          )}
          <AuthField
            label="New password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            icon="password"
            required
          />
          <AuthField
            label="Confirm password"
            type="password"
            placeholder="Type it again"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            icon="password"
            required
          />
          {password && !passwordOk && (
            <p className="text-xs text-rajlo-red">
              Passwords must be at least 8 characters.
            </p>
          )}
          {password && confirm && !matches && (
            <p className="text-xs text-rajlo-red">Passwords don&apos;t match.</p>
          )}
          <AuthSubmit
            onClick={submit}
            loading={submitting}
            disabled={!canSubmit}
          >
            Set password &amp; sign in
          </AuthSubmit>
          <p className="text-center text-xs text-muted">
            Your account is under review — you&apos;ll get a second email once
            an admin approves your documents (usually within 1–2 business
            days). Until then you can sign in but won&apos;t be able to
            accept trips.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
