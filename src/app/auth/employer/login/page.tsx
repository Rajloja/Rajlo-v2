"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
} from "@/components/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { friendlyError } from "@/lib/auth-errors";
import { setSessionPolicy } from "@/lib/session-policy";

/**
 * Employer sign-in. Field-agent / taxi-hub staff account. Same email +
 * password shape as the other portals but with a strict role check —
 * an admin, rider, or driver who lands here gets bounced with a clear
 * "use the right sign-in" message. No OAuth on this surface: employer
 * accounts are provisioned by admin, not self-service, so Google /
 * Apple sign-in would only confuse the flow.
 */
export default function EmployerLoginPage() {
  return (
    <Suspense>
      <EmployerLoginInner />
    </Suspense>
  );
}

function EmployerLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/employer";
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
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    // Verify the account is actually an employer account. Same guard
    // as the driver login — a rider / driver / admin who accidentally
    // types their credentials here gets a specific message pointing
    // them to the right portal, and we IMMEDIATELY sign them back out
    // so they don't sit with a stale wrong-portal session.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profile?.role !== "employer") {
      await supabase.auth.signOut();
      const wrongRole =
        profile?.role === "driver"
          ? "This is a driver account. Please use the driver sign-in instead."
          : profile?.role === "rider"
            ? "This is a rider account. Please use the rider sign-in instead."
            : profile?.role === "admin" ||
                profile?.role === "safety_officer"
              ? "This is an admin account. Please use the admin sign-in instead."
              : "This account isn't authorized for the employer portal.";
      setError(wrongRole);
      setIsLoading(false);
      return;
    }

    setSessionPolicy(remember ? "remember" : "session-only");
    router.push(next);
    router.refresh();
  };

  return (
    <AuthShell
      title="Employer sign in"
      subtitle="Onboard drivers on behalf of Rajlo."
      audience="employer"
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
            {error}
          </div>
        )}

        <AuthField
          label="Email"
          type="email"
          placeholder="agent@rajlo.com"
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
        <p className="text-center text-xs leading-relaxed text-muted">
          Employer accounts are provisioned by Rajlo admin. Need one?
          Contact your ops lead — self-signup isn&apos;t available here.
        </p>
      </div>
    </AuthShell>
  );
}
