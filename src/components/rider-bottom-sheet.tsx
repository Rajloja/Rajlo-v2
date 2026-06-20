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

  // ─── Wrapper height tracked from visualViewport ───
  // `100dvh` CSS resolves to the "small viewport" (with browser
  // chrome at its tallest) and DOESN'T update when Chrome's bottom
  // toolbar auto-hides on scroll. That leaves the wrapper shorter
  // than the actual visible viewport → empty strip below the sheet.
  // visualViewport.height is the truth — it tracks the live visible
  // area through every chrome show/hide cycle.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [wrapperHeight, setWrapperHeight] = useState(0);
  const [snaps, setSnaps] = useState({ collapsed: 0, expanded: 0 });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const recompute = () => {
      const vh = vv?.height ?? window.innerHeight;
      const h = Math.max(0, Math.round(vh - 56)); // minus navbar
      setWrapperHeight(h);
      setSnaps({
        collapsed: Math.round(h * 0.5),
        expanded: Math.round(h * 0.92),
      });
    };
    recompute();
    if (vv) {
      vv.addEventListener("resize", recompute);
      vv.addEventListener("scroll", recompute);
    }
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", recompute);
        vv.removeEventListener("scroll", recompute);
      }
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

  // ─── Scroll-to-expand on the content area ───
  // The rider can swipe ANYWHERE on the sheet content. We decide
  // per-gesture whether to drag the sheet or scroll the content:
  //
  //   Sheet COLLAPSED → drag the sheet (content can't meaningfully
  //                     scroll when only the top of it is visible).
  //   Sheet EXPANDED + content scrolled below top → native scroll.
  //   Sheet EXPANDED + content at top + swipe DOWN → drag sheet to
  //                     collapse (this is the "scroll back up to
  //                     close" gesture).
  //   Sheet EXPANDED + content at top + swipe UP → native scroll.
  //
  // Decision is locked per gesture. We attach the touch listeners
  // imperatively with `passive: false` so preventDefault works on
  // touchmove — React's synthetic events are passive by default.
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    if (snaps.collapsed <= 0) return;

    let startY = 0;
    let startHeight = 0;
    let startScrollTop = 0;
    let mode: "sheet" | "content" | null = null;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    const onStart = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      startY = y;
      startHeight = height.get();
      startScrollTop = el.scrollTop;
      lastY = y;
      lastTime = performance.now();
      velocity = 0;
      mode = null;
    };

    const onMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      const deltaY = y - startY; // +ve = swipe DOWN, -ve = swipe UP

      if (mode === null) {
        if (Math.abs(deltaY) < 4) return;
        const isExpandedNow = startHeight >= snaps.expanded - 12;
        if (!isExpandedNow) {
          mode = "sheet";
        } else if (startScrollTop > 0) {
          mode = "content";
        } else if (deltaY > 0) {
          mode = "sheet";
        } else {
          mode = "content";
        }
      }

      if (mode === "sheet") {
        // Stop native scroll so the sheet drag is the only motion.
        if (e.cancelable) e.preventDefault();
        const next = Math.max(
          snaps.collapsed - 40,
          Math.min(snaps.expanded + 20, startHeight - deltaY),
        );
        height.set(next);
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          velocity = ((lastY - y) / dt) * 1000; // +ve = upward (expand)
        }
        lastY = y;
        lastTime = now;
      }
      // mode === "content": do nothing — native scroll handles it.
    };

    const onEnd = () => {
      if (mode === "sheet") {
        const v = velocity;
        const current = height.get();
        if (v > 400) {
          snapTo(true, v);
        } else if (v < -400) {
          snapTo(false, v);
        } else {
          const midpoint = (snaps.collapsed + snaps.expanded) / 2;
          snapTo(current > midpoint, v);
        }
      }
      mode = null;
    };

    // passive: false on touchmove so preventDefault can stop native
    // scroll while we're driving the sheet. touchstart can stay
    // passive — we never preventDefault it.
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [height, snapTo, snaps.collapsed, snaps.expanded]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        ref={wrapperRef}
        className="-mx-4 -my-4 relative overflow-hidden"
        style={{
          // Live visible-viewport height minus navbar. Tracks Chrome
          // toolbar auto-hide cycles via visualViewport above. We
          // fall back to a `100dvh-3.5rem` CSS calc until JS measures
          // on first paint so there's no zero-height flash.
          height: wrapperHeight > 0 ? `${wrapperHeight}px` : "calc(100dvh - 3.5rem)",
        }}
      >
        {/* Map — fills the wrapper and never moves. */}
        <div className="absolute inset-0">{map}</div>

        {mapBadge && (
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
            {mapBadge}
          </div>
        )}

        {/* Bottom sheet — `height` motion value drives its size.
         z-40 sits above MapView's floating controls (locate-me at
         z-30) so the sheet always covers them when expanded. The
         page-level fixed action bar uses z-50 to stay above the
         sheet's bottom edge. */}
        <m.div
          className="absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)]"
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

          {/* Scrollable content. Touch listeners attached via
          contentScrollRef decide per-gesture whether to drag the
          sheet (when collapsed, or when expanded+at-top+swiping-down)
          or scroll the content (when expanded+scrolled, or
          expanded+at-top+swiping-up). `touch-action: pan-y` tells
          the browser we want vertical pan but we'll intercept it
          when needed. */}
          {/* `pb-16` (64 px) is just enough to clear the fixed action
          bar (height ≈ 56 px) underneath. The previous `pb-24` left
          a visible empty strip between the last form input and the
          action bar. */}
          <div
            ref={contentScrollRef}
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-16 pt-1"
          >
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
    const vv = window.visualViewport;
    const recompute = () => {
      const vh = vv?.height ?? window.innerHeight;
      setPx(Math.round((vh - 56) * snapFraction));
    };
    recompute();
    if (vv) {
      vv.addEventListener("resize", recompute);
      vv.addEventListener("scroll", recompute);
    }
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", recompute);
        vv.removeEventListener("scroll", recompute);
      }
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, [snapFraction]);
  return px;
}
