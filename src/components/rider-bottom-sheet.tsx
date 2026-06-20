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
  // Hard-lock the page so ONLY the sheet's content area scrolls.
  // Without this, touching the navbar or anywhere outside the sheet
  // scrolls the body (PortalLayout's `<main>` has `pb-20` on the
  // rider portal, which makes body taller than viewport and gives
  // it scrollable height). We:
  //   - overflow: hidden on body AND html (kills body scroll on
  //     every browser, including iOS Safari which sometimes ignores
  //     body-only locks)
  //   - touch-action: none on body to refuse touch-based panning,
  //     so a swipe on the navbar can't trigger a body scroll
  //   - overscroll-behavior: contain kills pull-to-refresh
  //
  // The sheet's content area opts back in with `touch-action: pan-y`,
  // so its internal scroll still works.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouch: body.style.touchAction,
    };
    html.style.overflow = "hidden";
    html.style.height = "100dvh";
    body.style.overflow = "hidden";
    body.style.height = "100dvh";
    body.style.overscrollBehavior = "contain";
    body.style.touchAction = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.touchAction = prev.bodyTouch;
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const recompute = () => {
      const vh = vv?.height ?? window.innerHeight;
      setWrapperHeight(Math.max(0, Math.round(vh - 56))); // minus navbar
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

  // ─── Measure content height so collapsed snap fits exactly ───
  // The collapsed snap was previously a fixed 50% of wrapper — but
  // the form content is usually much shorter, leaving empty white
  // space between the last input and the bottom of the sheet (the
  // "padding above the action bar" the user kept seeing). Now we
  // measure the actual rendered content height and set the snap to
  // (content + handle + small breathing room), capped at 80% of
  // wrapper so a very long form still leaves SOME map visible.
  const contentInnerRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const el = contentInnerRef.current;
    if (!el) return;
    const recompute = () => setContentHeight(el.scrollHeight);
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Final snap heights — collapsed fits content but CAPPED AT 50% of
  // the wrapper so:
  //   - Short forms don't get a giant white sheet with empty space
  //   - Long forms don't push the sheet past 50%, which would shove
  //     the locate-me button (positioned at the 50% mark) behind it
  //   - The map ALWAYS has at least the top half of the viewport
  const snaps = (() => {
    if (wrapperHeight <= 0) return { collapsed: 0, expanded: 0 };
    const handle = 24;
    const padding = 8;
    const desired = contentHeight + handle + padding;
    const cap = Math.round(wrapperHeight * 0.5);
    const floor = Math.round(wrapperHeight * 0.3);
    return {
      collapsed: Math.min(cap, Math.max(floor, desired)),
      expanded: Math.round(wrapperHeight * 0.92),
    };
  })();

  // Sheet height in px — drives the sheet's height directly.
  const height = useMotionValue<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync sheet height to the current snap target whenever the snap
  // values change. This handles:
  //   1. Initial mount (height starts at 0 → snap to collapsed)
  //   2. Viewport resizes (keyboard open/close, browser chrome
  //      show/hide, orientation change) → snap shrinks/grows, sheet
  //      follows
  //   3. Content height changes (form expands) → snap re-fits
  useEffect(() => {
    if (snaps.collapsed <= 0) return;
    const target = isExpanded ? snaps.expanded : snaps.collapsed;
    if (Math.abs(height.get() - target) > 1) {
      height.set(target);
    }
    // We deliberately exclude `isExpanded` from deps — that's handled
    // by the explicit snapTo() animation. This effect only reacts to
    // snap VALUE changes from the viewport/content side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps.collapsed, snaps.expanded]);

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
        {/* Map container — OFFSET so its geometric center coincides
         with the visible map area's center (NOT the wrapper's
         geometric center, which is hidden behind the sheet).
         Math: container top = -collapsedSheetHeight, height =
         wrapperHeight + collapsedSheetHeight. The container extends
         above the wrapper (clipped by overflow-hidden) and reaches
         the wrapper bottom. Its midpoint lands at the center of
         the visible map area. This means `map.setCenter(p)` puts
         `p` in the visible center WITHOUT any panBy / idle-event
         dance — works identically on iOS Safari + Chrome Android.
         Falls back to inset-0 until snaps are measured. */}
        {snaps.collapsed > 0 ? (
          <div
            className="absolute left-0 right-0"
            style={{
              top: `-${snaps.collapsed}px`,
              height: `${wrapperHeight + snaps.collapsed}px`,
            }}
          >
            {map}
          </div>
        ) : (
          <div className="absolute inset-0">{map}</div>
        )}

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
          {/* Scrollable area. The INNER div is what we measure via
          ResizeObserver to size the collapsed snap to fit content.
          `pb-12` (48 px) matches the fixed action bar's height
          exactly — last form element clears the bar with no empty
          strip between them, and when the rider taps an input the
          keyboard pushes the input above the action bar instead of
          padding it down. */}
          <div
            ref={contentScrollRef}
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
          >
            <div ref={contentInnerRef} className="px-4 pb-12 pt-1">
              {children}
            </div>
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
