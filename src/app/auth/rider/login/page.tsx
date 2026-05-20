"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  GoogleAuthButton,
  AppleAuthButton,
  AuthDivider,
} from "@/components/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { friendlyError, detectOAuthOnlyEmail } from "@/lib/auth-errors";
import { setSessionPolicy } from "@/lib/session-policy";

export default function RiderLoginPage() {
  // Suspense required by Next.js 16 for useSearchParams — without it, the
  // production prerender step fails.
  return (
    <Suspense>
      <RiderLoginInner />
    </Suspense>
  );
}

function RiderLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/rider";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(friendlyError(urlError));
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Detect the "signed up with Google, then tried email/password"
      // case so we can point them at the right button instead of the
      // generic "invalid credentials" message. Only fires after a
      // failed password attempt — keeps email enumeration off the
      // public surface.
      const friendly = await detectOAuthOnlyEmail(email);
      setError(friendly ?? authError.message);
      setIsLoading(false);
      return;
    }

    // Verify the account is actually a rider account. If a driver/admin tries
    // to sign in here, sign them back out and tell them where to go.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profile?.role !== "rider") {
      await supabase.auth.signOut();
      const wrongRole =
        profile?.role === "driver"
          ? "This is a driver account. Please use the driver sign-in instead."
          : profile?.role === "admin"
            ? "This is an admin account. Please use the staff sign-in instead."
            : profile?.role === "safety_officer"
              ? "This is a safety officer account. Please use the staff sign-in instead."
              : "This account isn't authorized for the rider portal.";
      setError(wrongRole);
      setIsLoading(false);
      return;
    }

    // Stamp the client-side session expiry. <SessionGuard> in the
    // rider portal layout reads this on every navigation and signs
    // the user out once it elapses.
    setSessionPolicy(remember ? "remember" : "session-only");

    router.push(next);
    router.refresh();
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your rider account"
      audience="rider"
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {error}
          </div>
        )}

        <GoogleAuthButton intent="rider" next={next} />
        <AppleAuthButton intent="rider" next={next} />
        <AuthDivider label="or sign in with email" />

        <AuthField
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          icon="email"
          required
        />
        <AuthField
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          icon="password"
          required
        />
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border border-line bg-surface accent-rajlo-red"
            />
            Stay signed in for 7 days
          </label>
          <Link
            href="/auth/forgot-password"
            className="text-xs font-semibold text-rajlo-red hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <AuthSubmit
          onClick={handleLogin}
          loading={isLoading}
          disabled={!email || !password}
        >
          Sign in
        </AuthSubmit>

        <p className="text-center text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/auth/rider/signup" className="font-semibold text-rajlo-red hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
