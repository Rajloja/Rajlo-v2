"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { FadeUp } from "@/components/anim";
import { Skeleton } from "@/components/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * /employer/settings
 *
 * Small self-service page. The employer surface is deliberately lean
 * (they're not a driver / rider using the app all day), so this
 * covers just the two things a field agent actually needs from their
 * own account:
 *
 *   1. See their account details — full name + email + last sign-in.
 *      Verifies they're signed into the right identity before they
 *      start onboarding a driver at the hub.
 *   2. Change password. Reuses Supabase's own updateUser({password})
 *      flow — no admin API, no re-auth-with-current-password prompt
 *      (Supabase's updateUser call is already gated by an active
 *      session, so knowing the current password isn't a prerequisite;
 *      session compromise is a different threat model).
 *
 * Sign-out button lives here too, since there's no separate profile
 * menu in the lean portal shell.
 */

type AccountInfo = {
  email: string;
  fullName: string;
  lastSignInAt: string | null;
};

export default function EmployerSettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      setAccount({
        email: user.email ?? "",
        fullName: profile?.full_name ?? "",
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    })();
  }, []);

  const passwordOk = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = passwordOk && matches && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setPassword("");
      setConfirm("");
      setSaveOk(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't update password.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/auth/employer/login");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <FadeUp>
        <div>
          <p className="font-secondary text-xs font-bold uppercase tracking-wider text-rajlo-red">
            Settings
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
            Your account
          </h1>
        </div>
      </FadeUp>

      <FadeUp delay={0.05}>
        <section className="rounded-3xl border border-line bg-surface p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Account details
          </h2>
          {account ? (
            <div className="mt-4 space-y-3">
              <Row label="Full name" value={account.fullName || "—"} />
              <Row label="Email" value={account.email} />
              <Row
                label="Last signed in"
                value={
                  account.lastSignInAt
                    ? new Date(account.lastSignInAt).toLocaleString("en-JM", {
                        timeZone: "America/Jamaica",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "never"
                }
              />
              <p className="pt-2 text-xs text-muted">
                Need to change your name or email? Ask a Rajlo admin — those
                are provisioned centrally.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-40" rounded="md" />
              <Skeleton className="h-4 w-60" rounded="md" />
              <Skeleton className="h-4 w-32" rounded="md" />
            </div>
          )}
        </section>
      </FadeUp>

      <FadeUp delay={0.1}>
        <section className="rounded-3xl border border-line bg-surface p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Change password
          </h2>
          <p className="mt-1 text-xs text-muted">
            Use at least 8 characters. Signs you out of other devices.
          </p>
          {saveOk && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Password updated.
            </div>
          )}
          {saveError && (
            <div className="mt-4 rounded-xl border border-rajlo-red/20 bg-primary-soft px-4 py-3 text-sm text-rajlo-red">
              {saveError}
            </div>
          )}
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">
                New password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">
                Confirm password
              </span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
              />
            </label>
            {password && !passwordOk && (
              <p className="text-xs text-rajlo-red">
                Passwords must be at least 8 characters.
              </p>
            )}
            {password && confirm && !matches && (
              <p className="text-xs text-rajlo-red">Passwords don&apos;t match.</p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rajlo-red/30 hover:-translate-y-0.5 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {saving ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                <>
                  <Icon name="shield-check" className="h-4 w-4" />
                  Update password
                </>
              )}
            </button>
          </div>
        </section>
      </FadeUp>

      <FadeUp delay={0.15}>
        <section className="rounded-3xl border border-dashed border-line bg-surface-soft p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">
            Session
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-bold hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
            <Link
              href="/employer"
              className="text-sm font-semibold text-muted hover:text-foreground"
            >
              Back to dashboard
            </Link>
          </div>
        </section>
      </FadeUp>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-soft px-3 py-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
