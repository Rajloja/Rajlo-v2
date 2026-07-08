"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { shortenLink } from "@/lib/short-link";

/**
 * EmailVerifyNudge — soft banner shown to signed-in users whose email
 * hasn't been confirmed yet.
 *
 * This exists because the rider signup flow no longer blocks on email
 * confirmation (see the "instant-session" branch in
 * app/auth/rider/signup/page.tsx). Without that gate, the confirmation
 * email is purely a background nudge + password-recovery anchor — which
 * means we need SOMEWHERE to remind the rider it happened, otherwise
 * they'll never click through and their account stays unrecoverable if
 * they forget the password.
 *
 * Design goals:
 *   - Nudge, not error. Amber, not red. Doesn't block anything.
 *   - Per-session dismissable — riders who don't want to verify right
 *     now can hide it for the session without ever seeing it again
 *     that visit. It comes back on a fresh session (browser restart /
 *     new device / cleared storage) so we still surface the ask.
 *   - Resend button uses supabase.auth.resend() with the same
 *     shortened callback URL the signup flow generated. Rate-limited
 *     to one resend per 60 s client-side so the button can't be spammed
 *     into abuse-blocking their account with Supabase's own throttler.
 *   - Silently hides itself when the user's `email_confirmed_at` flips
 *     — no reload required.
 */

const DISMISS_KEY = "rajlo-email-verify-nudge-dismissed";
const RESEND_COOLDOWN_MS = 60_000;

type Status = "loading" | "verified" | "unverified" | "dismissed";

export function EmailVerifyNudge({
  /** Where the user should end up after clicking the confirmation link.
   *  Defaults to the current page so they land right back where they
   *  started. Callers on stateful pages (e.g. the booking wizard) can
   *  pass an explicit path so the round-trip is deterministic. */
  callbackNext,
}: {
  callbackNext?: string;
} = {}) {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [lastResendAt, setLastResendAt] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Per-session dismissal — checked before we ever hit the network.
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(DISMISS_KEY) === "1"
      ) {
        if (!cancelled) setStatus("dismissed");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      if (!user || !user.email) {
        // Anonymous or unusually incomplete account — nothing to nudge.
        setStatus("verified");
        return;
      }
      if (user.email_confirmed_at) {
        setStatus("verified");
        return;
      }
      setEmail(user.email);
      setStatus("unverified");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for auth events so if the user clicks the confirmation link
  // in another tab and the session refreshes here, the banner drops
  // itself without a full reload.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user?.email_confirmed_at) {
          setStatus("verified");
        }
      },
    );
    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Safari private mode etc. — the state below still hides it for
         this render, which is what the user tapped for. */
    }
    setStatus("dismissed");
  };

  const resend = async () => {
    const now = Date.now();
    if (now - lastResendAt < RESEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil(
        (RESEND_COOLDOWN_MS - (now - lastResendAt)) / 1000,
      );
      setResendError(
        `Give it a moment — you can request another email in ${secondsLeft}s.`,
      );
      return;
    }
    if (!email) return;
    setResending(true);
    setResendError(null);
    setResendMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Same callback-URL shape the signup flow uses. Passing the
      // rider's current URL as `next` means clicking the link on
      // mobile drops them exactly where they were reading the banner.
      const targetNext =
        callbackNext ??
        (typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/rider");
      const rawCallback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(targetNext)}`;
      const emailRedirectTo = await shortenLink(rawCallback);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo },
      });
      if (error) {
        setResendError(error.message);
        return;
      }
      setLastResendAt(now);
      setResendMessage(`Sent to ${email}. Check your inbox in a minute.`);
    } catch (e) {
      setResendError(
        e instanceof Error ? e.message : "Couldn't resend right now.",
      );
    } finally {
      setResending(false);
    }
  };

  if (status !== "unverified") return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-start"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-200 text-amber-900">
        <Icon name="mail" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold leading-tight">
          Verify your email to secure your account
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/85">
          You&rsquo;re signed in and ready to ride. Confirm{" "}
          {email ? (
            <span className="font-bold">{email}</span>
          ) : (
            "your email"
          )}{" "}
          so you can recover it if you ever forget your password.
        </p>
        {(resendMessage || resendError) && (
          <p
            className={`mt-1.5 text-[11px] font-semibold ${
              resendError ? "text-rajlo-red" : "text-emerald-700"
            }`}
          >
            {resendError ?? resendMessage}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-4 py-2 text-xs font-bold text-amber-50 transition-colors hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resending ? (
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-amber-50 border-t-transparent" />
          ) : (
            <Icon name="mail" className="h-3.5 w-3.5" />
          )}
          {resending ? "Sending…" : "Resend email"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss reminder"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-amber-900 transition-colors hover:bg-amber-200"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
