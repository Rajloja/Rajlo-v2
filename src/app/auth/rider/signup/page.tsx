"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  AuthPhoneField,
  GoogleAuthButton,
  AppleAuthButton,
  AuthDivider,
} from "@/components/auth-shell";
import { LegalConsent } from "@/components/legal-consent";
import { documentsForRole } from "@/lib/legal-documents";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const RIDER_LEGAL_DOCS = documentsForRole("rider");

export default function RiderSignupPage() {
  // Suspense required by Next.js 16 for useSearchParams — without it,
  // the production prerender step fails. Matches the same shape as
  // the sibling login page.
  return (
    <Suspense>
      <RiderSignupInner />
    </Suspense>
  );
}

function RiderSignupInner() {
  // Preserve any destination handed in from a public surface (e.g. the
  // landing-page booking widget pushes the visitor here with
  // ?next=/rider/request?to_name=…). The email-confirmation link
  // routes back through /auth/callback with that same `next`, and the
  // GoogleAuthButton / AppleAuthButton wrappers thread it through the
  // OAuth state so post-auth lands the rider in the right place
  // with their trip params still filled in.
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/rider";

  const [step, setStep] = useState<"info" | "check-email">("info");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
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
          `This email is already registered ${roleLabel}. Please sign in instead, or use a different email to create a rider account.`,
        );
        setIsLoading(false);
        return;
      }
    } catch {
      // If the check itself fails, fall through to signUp — Supabase will
      // still reject duplicate confirmed accounts on its own.
    }

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: {
          full_name: name,
          phone,
          role: "rider",
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setStep("check-email");
  };

  // Preserve `next` when handing the visitor back to the login page so
  // the cross-flow doesn't drop their pending destination.
  const loginHref =
    next === "/rider"
      ? "/auth/rider/login"
      : `/auth/rider/login?next=${encodeURIComponent(next)}`;

  if (step === "check-email") {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`We sent a confirmation link to ${email}. Click it to activate your Rajlo account.`}
        audience="rider"
      >
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
            <svg className="h-8 w-8 text-rajlo-red" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
          </div>
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
            href={loginHref}
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
      title="Create your account"
      subtitle="Join Rajlo and book a ride anywhere, anytime."
      audience="rider"
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {error}
          </div>
        )}

        <GoogleAuthButton intent="rider" label="Sign up with Google" next={next} />
        <AppleAuthButton intent="rider" label="Sign up with Apple" next={next} />
        <AuthDivider label="or sign up with email" />

        <AuthField label="Full name" placeholder="Your name" value={name} onChange={setName} autoComplete="name" icon="user" required />
        <AuthField label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} autoComplete="email" icon="email" required />
        <AuthPhoneField label="Phone number" placeholder="876 555 0123" value={phone} onChange={setPhone} required />
        <AuthField label="Password" type="password" placeholder="At least 8 characters" value={password} onChange={setPassword} autoComplete="new-password" icon="password" required />
        <LegalConsent
          documents={RIDER_LEGAL_DOCS}
          checked={agreed}
          onChange={setAgreed}
        />
        <AuthSubmit onClick={handleSignup} loading={isLoading} disabled={!name || !email || !phone || !password || !agreed}>
          Create account
        </AuthSubmit>
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="font-semibold text-rajlo-red hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
