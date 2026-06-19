"use client";

import { useEffect, useState } from "react";

/**
 * Returns whether the current viewport is mobile (< 768px wide).
 *
 * Why this and not Tailwind's `md:hidden` / `hidden md:block`?
 * Tailwind's responsive utilities only TOGGLE VISIBILITY — both
 * branches still mount in the DOM. For lightweight markup that's
 * fine, but when each branch contains components that subscribe to
 * realtime channels (chat, calls), open WebSockets, or instantiate
 * Google Maps, mounting both halves doubles the work and can cause
 * race conditions when their effects collide.
 *
 * Returns `{ isMobile, mounted }`:
 *   - `mounted` is false during SSR and the first client render so
 *     the caller can render a safe default (typically the mobile
 *     branch — it's a strict subset of the desktop layout).
 *   - After hydration `mounted` becomes true and `isMobile` reflects
 *     the actual viewport width. Subsequent resizes update both.
 *
 * The breakpoint matches Tailwind's `md` (768px) so a single value is
 * used across CSS + React rendering and the two can't drift.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return { isMobile, mounted };
}
