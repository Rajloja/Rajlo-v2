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
  /** Optional action bar pinned to the bottom of the sheet itself
   *  (NOT a separate viewport-fixed element). This eliminates the
   *  gap between the scrollable form content and the action bar —
   *  they're flex siblings, touching directly. The action bar
   *  stays visible at every snap point because the sheet's bottom
   *  edge is always at the viewport bottom. */
  actionBar,
  /** Optional badge / pill anchored to the top-left of the map area. */
  mapBadge,
  /** Whether body-scroll-lock + keyboard auto-expand are active.
   *  Parent pages render this component during SSR + first client
   *  paint (before the viewport check resolves) and then unmount it
   *  on desktop. If the body lock fires during that brief mount, the
   *  cleanup's window.scrollTo causes a visible jump on desktop. Pass
   *  the parent's resolved `viewportReady && isMobile` here so the
   *  lock only engages when the sheet will actually stick around. */
  enabled = true,
  /** Token to imperatively collapse the sheet. Any CHANGE to this
   *  value (from one render to the next) triggers `snapTo(false)`.
   *  Used by the request page to auto-collapse after a dropoff is
   *  picked so the rider gets a wider map view of the full route.
   *  The first observed value is ignored so initial mount doesn't
   *  fire the collapse. */
  collapseSignal,
}: {
  map: ReactNode;
  children: ReactNode;
  actionBar?: ReactNode;
  mapBadge?: ReactNode;
  enabled?: boolean;
  collapseSignal?: number;
}) {
  // Lock body scroll — the proven `position: fixed` pattern.
  //
  // `overflow-y: hidden` ALONE is not enough on iOS Safari or
  // Chrome Android: when the page content overflows the viewport
  // (rider portal's <main> has pb-20 reserving 80px for non-existent
  // bottom nav, plus min-h-screen on the layout), touch-based scroll
  // still works regardless of overflow. iOS in particular ignores
  // overflow:hidden on body for touch.
  //
  // `position: fixed` actually severs the body from the scroll
  // viewport — it cannot scroll because there's nothing to scroll
  // (body is detached from page flow). This is the same pattern
  // body-scroll-lock and react-scroll-lock have settled on after
  // years of cross-browser pain.
  //
  // Side effect benefit: with body fixed, iOS Safari can NO LONGER
  // scroll the body to bring a focused input into view (which was
  // pushing our navbar off-screen and revealing dead space where
  // the action bar should be). Instead, iOS scrolls the nearest
  // scrollable ancestor — the sheet's contentScrollRef container —
  // which is exactly what we want.
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [enabled]);

  // ─── Wrapper height, sized from the LAYOUT viewport ───
  // wrapperHeight = window.innerHeight - 56 (navbar).
  //
  // Critically this uses window.innerHeight, NOT visualViewport.height.
  // The sheet no longer hosts ANY text inputs — every text field (the
  // location search, the driver note) opens its own full-screen overlay
  // ON TOP of the sheet. So the sheet must NOT react to the on-screen
  // keyboard at all: it just stays anchored to the viewport bottom while
  // an overlay's keyboard comes and goes above it.
  //
  // window.innerHeight does NOT shrink when the keyboard opens on iOS
  // (only visualViewport.height does), so basing the sheet on it keeps
  // it rock-steady — no more "action bar floating mid-screen with a
  // white gap below it" after an overlay's keyboard dismisses, which is
  // exactly what the old visualViewport-derived bottom inset caused.
  // It still tracks the mobile browser's address-bar hide/show.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [wrapperHeight, setWrapperHeight] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recompute = () => {
      setWrapperHeight(Math.max(0, Math.round(window.innerHeight - 56)));
    };
    recompute();
    // visualViewport 'resize' also fires on address-bar changes and
    // catches a few cases window 'resize' misses; recompute reads
    // innerHeight either way, so keyboard open/close is a no-op.
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", recompute);
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      if (vv) vv.removeEventListener("resize", recompute);
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
  // Desired height includes content + handle (40 px) + action bar
  // estimate (60 px). Real action bar height will vary slightly; the
  // capped value keeps us in a sensible range regardless.
  const snaps = (() => {
    if (wrapperHeight <= 0) return { collapsed: 0, expanded: 0 };
    const handle = 40;
    const actionBarEstimate = 60;
    const desired = contentHeight + handle + actionBarEstimate;
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

  // Initial parking — set the sheet to collapsed once snaps resolve.
  // We deliberately do NOT update on every snap change: drag + the
  // collapse signal own resnaps; this effect only seeds the initial
  // value on first paint.
  useEffect(() => {
    if (snaps.collapsed > 0 && height.get() === 0) {
      height.set(snaps.collapsed);
    }
  }, [snaps.collapsed, height]);

  // Clamp the sheet to never exceed the wrapper. An uncapped sheet
  // taller than wrapper would have its top clipped by overflow-hidden,
  // pushing the form content out of view above the wrapper's top edge.
  // Ease to the correct snap point instead of snapping instantly —
  // an instant height.set on every visualViewport change (e.g. Chrome
  // address bar sliding back in shrinking the viewport ~60px) caused
  // a visible 10–20px sheet jerk that read as the sheet glitching.
  useEffect(() => {
    if (wrapperHeight <= 0) return;
    if (height.get() > wrapperHeight) {
      const target = isExpanded ? snaps.expanded : snaps.collapsed;
      animate(height, target, {
        type: "spring",
        bounce: 0.2,
        duration: 0.25,
      });
    }
  }, [wrapperHeight, snaps.expanded, snaps.collapsed, isExpanded, height]);

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

  // Imperative collapse on parent signal. Parent bumps `collapseSignal`
  // (typically after the rider picks a dropoff). Snap to collapsed so
  // the rider gets a wider map view of the now-complete route.
  const prevCollapseSignalRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    if (collapseSignal === undefined) return;
    if (prevCollapseSignalRef.current === undefined) {
      // Seed on first observation — initial mount must not trigger.
      prevCollapseSignalRef.current = collapseSignal;
      return;
    }
    if (collapseSignal === prevCollapseSignalRef.current) return;
    prevCollapseSignalRef.current = collapseSignal;
    // Defer out of the effect body (next frame) so we're not calling
    // setState synchronously during the effect — and it reads as a
    // deliberate animated collapse rather than an instant jump.
    const id = requestAnimationFrame(() => snapTo(false));
    return () => cancelAnimationFrame(id);
  }, [collapseSignal, enabled, snapTo]);

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
        // Decide per-gesture: drag the sheet, or scroll the content.
        // Some steps (the summary, with its full fare breakdown) have
        // content TALLER than the expanded sheet, so the rider must be
        // able to scroll to see the bottom — but a swipe-down at the
        // top should still collapse the sheet.
        //   collapsed                 → drag sheet (expand)
        //   expanded + scrolled       → scroll content
        //   expanded + at top + down  → drag sheet (collapse)
        //   expanded + at top + up    → scroll content (reveal more)
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
      </div>

      {/* Bottom sheet — position:fixed, flush to the layout-viewport
       bottom (bottom:0). It no longer tracks the keyboard via a
       visualViewport-derived inset: that inset got stuck after a
       full-screen overlay's keyboard dismissed, leaving the action bar
       floating mid-screen with a white gap below it. Since no text
       inputs live in the sheet anymore (they open overlays on top),
       anchoring to bottom:0 keeps the action bar glued to the viewport
       bottom at all times. No safe-area-inset-bottom — that produced a
       34px gap below the action bar on iPhones. */}
      <m.div
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)]"
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
        when needed. No bottom padding — action bar sits directly
        below as a flex sibling, zero space between. */}
        <div
          ref={contentScrollRef}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
        >
          <div ref={contentInnerRef} className="px-4 pt-1">
            {children}
          </div>
        </div>

        {/* Action bar — pinned as the LAST flex child of the sheet,
        which sits at visualViewport bottom via the position:fixed
        + bottom inset above. Above the keyboard when open, flush
        against viewport bottom when closed. */}
        {actionBar && (
          <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
            {actionBar}
          </div>
        )}
      </m.div>
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
