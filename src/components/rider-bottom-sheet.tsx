"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { LazyMotion, domAnimation, m, useMotionValue, animate } from "motion/react";

/**
 * Mobile bottom-sheet layout for rider screens.
 *
 * Hand-rolled implementation — vaul's portal-based architecture
 * fought too many edge cases with our PortalLayout (sticky navbar,
 * body scroll, iOS keyboard handling). This is the simpler model:
 *
 *   - Sheet is a normal `absolute bottom-0` element inside the
 *     wrapper. No portal. No body scroll lock.
 *   - Map is `absolute inset-0` filling the wrapper. Stays put.
 *     The sheet overlays from below, the map never moves.
 *   - Drag works by tracking the height directly via touch events
 *     on the HANDLE ONLY. Content scrolling is normal browser scroll
 *     — we don't compete with it.
 *   - Two snap points: 50dvh (collapsed) and 92dvh (expanded). Snap
 *     on release based on position + velocity.
 *
 * The wrapper is `overflow-hidden` so the sheet is clipped to the
 * wrapper bounds, which is everything below the 3.5rem PortalLayout
 * header. Nothing escapes.
 */
export function RiderBottomSheet({
  map,
  children,
  /** Optional badge / pill anchored to the top-left of the map area. */
  mapBadge,
}: {
  map: ReactNode;
  children: ReactNode;
  mapBadge?: ReactNode;
}) {
  // Lock body scroll while the sheet is mounted. PortalLayout's
  // `<main>` has `pb-20` on the rider portal, which makes body
  // taller than viewport and lets every swipe on the sheet ALSO
  // scroll the body — which pulls the map along. `overflow-y:
  // hidden` is more surgical than `overflow: hidden` and doesn't
  // disturb the sticky navbar's positioning. `overscroll-behavior:
  // contain` kills iOS / Chrome pull-to-refresh.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflowY;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflowY = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflowY = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  // ─── Snap points in pixels (recomputed on resize) ───
  // 50dvh and 92dvh of the WRAPPER height (which is 100dvh - 3.5rem).
  const [snaps, setSnaps] = useState({ collapsed: 0, expanded: 0 });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recompute = () => {
      const wrapperHeight = window.innerHeight - 56; // 3.5rem in px
      setSnaps({
        collapsed: Math.round(wrapperHeight * 0.5),
        expanded: Math.round(wrapperHeight * 0.92),
      });
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, []);

  // Sheet height in px — drives the sheet's height directly.
  const height = useMotionValue<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Initial parking once snaps resolve.
  useEffect(() => {
    if (snaps.collapsed > 0 && height.get() === 0) {
      height.set(snaps.collapsed);
    }
  }, [snaps.collapsed, height]);

  const animateTo = useCallback(
    (target: number, velocity = 0) => {
      animate(height, target, {
        type: "spring",
        bounce: 0.2,
        velocity,
        duration: 0.35,
      });
    },
    [height],
  );

  const snapTo = useCallback(
    (expanded: boolean, velocity = 0) => {
      setIsExpanded(expanded);
      animateTo(expanded ? snaps.expanded : snaps.collapsed, velocity);
    },
    [animateTo, snaps.collapsed, snaps.expanded],
  );

  // ─── Drag tracking — handle-only ───
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const lastMoveYRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const velocityRef = useRef(0);

  const onHandleTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const y = e.touches[0]?.clientY ?? 0;
      dragStartYRef.current = y;
      dragStartHeightRef.current = height.get();
      lastMoveYRef.current = y;
      lastMoveTimeRef.current = performance.now();
      velocityRef.current = 0;
    },
    [height],
  );

  const onHandleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const y = e.touches[0]?.clientY ?? 0;
      const deltaY = dragStartYRef.current - y; // +ve = swipe UP, expand
      const next = Math.max(
        snaps.collapsed - 50, // small overshoot allowance
        Math.min(snaps.expanded + 50, dragStartHeightRef.current + deltaY),
      );
      height.set(next);
      // Track velocity for snap physics.
      const now = performance.now();
      const dt = now - lastMoveTimeRef.current;
      if (dt > 0) {
        velocityRef.current = ((lastMoveYRef.current - y) / dt) * 1000;
      }
      lastMoveYRef.current = y;
      lastMoveTimeRef.current = now;
    },
    [height, snaps.collapsed, snaps.expanded],
  );

  const onHandleTouchEnd = useCallback(() => {
    const v = velocityRef.current; // +ve = upward (expand), -ve = downward (collapse)
    const current = height.get();
    if (v > 400) {
      snapTo(true, v);
    } else if (v < -400) {
      snapTo(false, v);
    } else {
      const midpoint = (snaps.collapsed + snaps.expanded) / 2;
      snapTo(current > midpoint, v);
    }
  }, [snapTo, snaps.collapsed, snaps.expanded, height]);

  const toggleSheet = useCallback(() => {
    if (snaps.collapsed <= 0) return;
    snapTo(!isExpanded);
  }, [isExpanded, snapTo, snaps.collapsed]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="-mx-4 -my-4 relative h-[calc(100dvh-3.5rem)] overflow-hidden">
        {/* Map — fills the wrapper and never moves. */}
        <div className="absolute inset-0">{map}</div>

        {mapBadge && (
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
            {mapBadge}
          </div>
        )}

        {/* Bottom sheet — `height` motion value drives its size. */}
        <m.div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)]"
          style={{ height }}
        >
          {/* Handle — the ONLY draggable area. Big touch target. */}
          <button
            type="button"
            onClick={toggleSheet}
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
            onTouchCancel={onHandleTouchEnd}
            aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
            className="flex h-10 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing touch-none"
          >
            <span className="h-1.5 w-12 rounded-full bg-line" />
          </button>

          {/* Scrollable content — native browser scroll, no
          interception. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-1">
            {children}
          </div>
        </m.div>
      </div>
    </LazyMotion>
  );
}

/**
 * Helper that callers can use to figure out how far to push floating
 * map controls above the drawer's collapsed snap so they aren't
 * hidden behind it. Pass the result to MapView's
 * `floatingControlsBottomPx`.
 */
export function useFloatingControlsOffset(snapFraction = 0.5) {
  const [px, setPx] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recompute = () =>
      setPx(Math.round((window.innerHeight - 56) * snapFraction));
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, [snapFraction]);
  return px;
}
