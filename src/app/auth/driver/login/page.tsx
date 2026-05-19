"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  GoogleAuthButton,
  AuthDivider,
} from "@/components/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { friendlyError, detectOAuthOnlyEmail } from "@/lib/auth-errors";
import { setSessionPolicy } from "@/lib/session-policy";
import { isNativeApp } from "@/lib/native";

export default function DriverLoginPage() {
  // Suspense required by Next.js 16 for useSearchParams — without it, the
  // production prerender step fails.
  return (
    <Suspense>
      <DriverLoginInner />
    </Suspense>
  );
}

function DriverLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/driver";
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
      // OAuth-only-account detection (see rider login for context).
      const friendly = await detectOAuthOnlyEmail(email);
      setError(friendly ?? authError.message);
      setIsLoading(false);
      return;
    }

    // Verify the account is actually a driver account.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profile?.role !== "driver") {
      await supabase.auth.signOut();
      const wrongRole =
        profile?.role === "rider"
          ? "This is a rider account. Please use the rider sign-in instead."
          : profile?.role === "admin"
            ? "This is an admin account. Please use the admin sign-in instead."
            : "This account isn't authorized for the driver portal.";
      setError(wrongRole);
      setIsLoading(false);
      return;
    }

    // A fresh login always starts the driver OFFLINE — they must
    // explicitly tap "Go online" to take trips. Without this, a driver
    // who was online when they last closed the app would silently be
    // dispatchable again the moment they sign back in. The endpoint
    // 409s if a trip is mid-flight (a driver re-authenticating with a
    // rider aboard must stay online) — that case is left untouched.
    await fetch("/api/driver/online", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: false }),
    }).catch(() => null);

    // Stamp the client-side session expiry. <SessionGuard> in the
    // driver portal layout reads this on every navigation and signs
    // the user out once it elapses.
    setSessionPolicy(remember ? "remember" : "session-only");

    router.push(next);
    router.refresh();
  };

  return (
    <AuthShell
      title="Driver sign in"
      subtitle="Welcome back. Let's get on the road."
      audience="driver"
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {error}
          </div>
        )}

        <GoogleAuthButton intent="driver" next={next} />
        <AuthDivider label="or sign in with email" />

        <AuthField
          label="Email"
          type="email"
          placeholder="driver@example.com"
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
        <AuthSubmit onClick={handleLogin} loading={isLoading} disabled={!email || !password}>
          Sign in
        </AuthSubmit>
        {/* Sign-up link is web-only. The Capacitor app is locked to
            verified drivers — new applicants must onboard on the web
            first. Showing the link in-app would just hit the
            NativeDriverGuard and bounce back. */}
        {!isNativeApp() && (
          <p className="text-center text-sm text-muted">
            New to Rajlo?{" "}
            <Link
              href="/driver-join"
              className="font-semibold text-rajlo-red hover:underline"
            >
              Become a driver
            </Link>
          </p>
        )}
        {isNativeApp() && (
          <p className="text-center text-xs text-muted">
            Need to apply? Open{" "}
            <span className="font-semibold text-foreground">rajlo.com</span>{" "}
            on your phone&apos;s browser or computer to start the
            onboarding application.
          </p>
        )}
      </div>
    </AuthShell>
  );
}
