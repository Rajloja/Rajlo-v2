"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { IncomingCallToast } from "./incoming-call-toast";

/**
 * Thin client-side wrapper that resolves the current user once and
 * mounts <IncomingCallToast> against their auth.users.id. Server
 * layouts can't reach the user in a sync render, and we want this
 * to be portable (drop it into any portal layout), so the user
 * lookup lives here.
 *
 * Renders nothing while resolving the user. The toast itself is
 * invisible until an incoming call arrives via Realtime — no layout
 * cost for the common case.
 */
export function IncomingCallProvider() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setUserId(data.user?.id ?? null);
    })();
    // Also listen for auth changes (sign-out → tear down listener).
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);
  if (!userId) return null;
  return <IncomingCallToast userId={userId} />;
}
