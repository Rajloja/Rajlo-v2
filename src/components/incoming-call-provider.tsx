"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { IncomingCallToast, type PreloadedIncomingCall } from "./incoming-call-toast";

/**
 * Thin client-side wrapper that resolves the current user once and
 * mounts <IncomingCallToast> against their auth.users.id. Server
 * layouts can't reach the user in a sync render, and we want this
 * to be portable (drop it into any portal layout), so the user
 * lookup lives here.
 *
 * Also picks up the `?call={id}` URL parameter that push
 * notifications carry. When a user taps a push to wake the page,
 * the call's INSERT has already happened — the Realtime
 * subscription doesn't fire because it only catches *future*
 * events. We fetch the row directly and pass it down as a
 * "preloaded" incoming call so the ringer pops as if the user had
 * been on the page when it fired.
 */
export function IncomingCallProvider() {
  const [userId, setUserId] = useState<string | null>(null);
  const [preloaded, setPreloaded] = useState<PreloadedIncomingCall | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setUserId(data.user?.id ?? null);
    })();
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  // Pick up `?call={id}` and clear the param after handling so a
  // hard refresh doesn't re-pop the ringer for an already-answered
  // call. Falls back to no-op if the URL has no call param.
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const callId = params.get("call");
    if (!callId) return;
    // Strip the param immediately so refreshes don't re-pop.
    params.delete("call");
    const search = params.toString();
    const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", newUrl);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/calls/${callId}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          call: {
            id: string;
            status: string;
            callerName: string;
            callerRole: "rider" | "driver";
            viewerIsCallee: boolean;
          };
        };
        // Only show the ringer if (a) the viewer is the callee, and
        // (b) the call is still in a state where they can accept.
        // Past-tense (ended / declined / missed) calls just close
        // out silently.
        if (
          !cancelled &&
          json.call.viewerIsCallee &&
          ["initiated", "ringing"].includes(json.call.status)
        ) {
          setPreloaded({
            id: json.call.id,
            callerName: json.call.callerName,
            callerRole: json.call.callerRole,
          });
        }
      } catch {
        /* swallow — Realtime sub is the primary signal anyway */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;
  return <IncomingCallToast userId={userId} preloaded={preloaded} onPreloadConsumed={() => setPreloaded(null)} />;
}
