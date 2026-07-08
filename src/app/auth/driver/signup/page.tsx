"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  GoogleAuthButton,
  AppleAuthButton,
  AuthDivider,
} from "@/components/auth-shell";
import { LegalConsent } from "@/components/legal-consent";
import { documentsForRole } from "@/lib/legal-documents";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

// The full set of policies a driver agrees to at signup — includes the
// Driver Agreement, earnings disclaimer, and driver cancellation policy
// on top of the shared platform policies. The logged, timestamped
// acceptance is recorded server-side by the consent gate on first
// authenticated entry (POST /api/legal/accept).
const DRIVER_LEGAL_DOCS = documentsForRole("driver");

/**
 * Driver signup — email + password only.
 *
 * Personal info (name, phone, red plate, TRN/NIS, licence, vehicle
 * details, all 10 TA documents) is collected on the dedicated
 * /driver/onboarding wizard the driver lands on after they confirm
 * their email. That wizard already UPDATEs profiles.full_name from
 * the composed first+last (see /api/driver/onboarding) and inserts
 * the drivers row with plate + everything else — so collecting any
 * of that here is wasted typing for the driver, who has to enter it
 * all again on the next screen.
 *
 * The signUp() metadata still pins `role: "driver"` because the
 * `handle_new_user()` Postgres trigger reads that to seed the
 * profiles row with the correct role on insert. Without it the
 * profile would default to 'rider' and the auth callback wouldn't
 * route the user to /driver/onboarding.
 */
export default function DriverSignupPage() {
  const [step, setStep] = useState<"info" | "check-email">("info");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setIsLoading(false);
      return;
    }

    // Pre-check: reject if this email is already registered (any role).
    // Supabase silently re-sends a confirmation for existing-but-unconfirmed
    // accounts, which would mislead the user — so we check explicitly first.
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as {
        exists?: boolean;
        role?: "rider" | "driver" | "admin";
      };
      if (json.exists) {
        const roleLabel =
          json.role === "driver"
            ? "as a Rajlo driver"
            : json.role === "admin"
              ? "as a Rajlo admin"
              : "as a Rajlo rider";
        setError(
          `This email is already registered ${roleLabel}. Please sign in instead, or use a different email to create a driver account.`,
        );
        setIsLoading(false);
        return;
      }
    } catch {
      // If the check itself fails, fall through to signUp — Supabase will
      // still reject duplicate confirmed accounts on its own.
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/driver/onboarding`,
        data: {
          // role is the ONLY metadata field that has to be set here —
          // the handle_new_user() Postgres trigger reads it to seed the
          // profiles row with role='driver' on insert. Everything else
          // (full_name, phone, plate, etc.) is captured by the
          // onboarding wizard, which UPSERTs into profiles + drivers
          // when the driver submits.
          role: "driver",
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    // Instant-session path — same shape as the rider signup. When the
    // Supabase project has "Confirm email" off, signUp returns a live
    // session and we can drop the driver straight onto the onboarding
    // wizard instead of parking them on a "check your inbox" screen
    // they'd otherwise ignore during a long verification queue.
    if (data.session) {
      window.location.assign("/driver/onboarding");
      return;
    }

    setIsLoading(false);
    setStep("check-email");
  };

  if (step === "check-email") {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`We sent a confirmation link to ${email}. Click it to activate your driver account.`}
        audience="driver"
      >
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
            <svg className="h-8 w-8 text-rajlo-red" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
          </div>
          <p className="text-sm text-muted">
            After confirming, you&apos;ll be redirected to driver onboarding to enter your personal info and upload your TA documents.
          </p>
          <p className="text-sm text-muted">
            Didn&apos;t get it? Check your spam folder, or{" "}
            <button
              onClick={() => setStep("info")}
              className="font-semibold text-rajlo-red hover:underline"
            >
              try a different email
            </button>
            .
          </p>
          <Link
            href="/auth/driver/login"
            className="block rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold text-foreground hover:bg-surface-soft"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Become a Rajlo driver"
      subtitle="Create your account in seconds. You'll add your personal info and TA documents on the next step."
      audience="driver"
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {error}
          </div>
        )}

        <GoogleAuthButton
          intent="driver"
          next="/driver/onboarding"
          label="Sign up with Google"
        />
        <AppleAuthButton
          intent="driver"
          next="/driver/onboarding"
          label="Sign up with Apple"
        />
        <AuthDivider label="or sign up with email" />

        <AuthField label="Email" type="email" placeholder="driver@example.com" value={email} onChange={setEmail} autoComplete="email" icon="email" required />
        <AuthField label="Password" type="password" placeholder="At least 8 characters" value={password} onChange={setPassword} autoComplete="new-password" icon="password" required />

        <div className="rounded-xl bg-primary-soft px-4 py-3 text-xs text-rajlo-black">
          <strong>Red plate only.</strong> Rajlo accepts drivers with valid TA Franchise Certificates and PPV-rated insurance. You&apos;ll be asked to upload these on the next step.
        </div>

        <LegalConsent
          documents={DRIVER_LEGAL_DOCS}
          checked={agreed}
          onChange={setAgreed}
        />

        <AuthSubmit onClick={handleSubmit} loading={isLoading} disabled={!email || !password || !agreed}>
          Create account & continue to onboarding
        </AuthSubmit>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/driver/login" className="font-semibold text-rajlo-red hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
