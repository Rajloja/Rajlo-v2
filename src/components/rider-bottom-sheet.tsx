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
 * Scroll-controlled snap behaviour (Uber / Apple Maps style):
 *   - Default state: collapsed at `sheetTop` (default 50vh). Map
 *     takes the top half, sheet takes the bottom half.
 *   - When the rider swipes UP anywhere inside the sheet, the SHEET
 *     itself rises toward `expandedTop` (default 8vh) BEFORE any
 *     scroll happens inside the content. The content area never
 *     scrolls until the sheet is fully expanded.
 *   - When fully expanded, normal vertical scroll takes over.
 *   - Swiping DOWN at the top of the content (or anywhere while
 *     collapsed) collapses the sheet back to its rest position.
 *
 * The map container is sized to the sheet's LIVE top edge so MapView's
 * floating controls (locate-me, fullscreen) always sit just above
 * the sheet — never hidden behind it.
 *
 * No drag handle required — the gesture is the scroll itself. The
 * visible handle stays as an affordance.
 */
export function RiderBottomSheet({
  map,
  children,
  actionBar,
  /** Where the top of the sheet sits when collapsed. Default 50vh. */
  sheetTop = "50vh",
  /** Where the top of the sheet sits when expanded. Default 8vh. */
  expandedTop = "8vh",
  /** Optional badge / pill anchored to the top-left of the map area. */
  mapBadge,
}: {
  map: ReactNode;
  children: ReactNode;
  actionBar?: ReactNode;
  sheetTop?: string;
  expandedTop?: string;
  mapBadge?: ReactNode;
}) {
  // Resolve vh-based snap points to px once on mount + on resize.
  const [snaps, setSnaps] = useState<{ collapsed: number; expanded: number }>({
    collapsed: 0,
    expanded: 0,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const resolve = (v: string) => {
      const m = v.match(/^([\d.]+)vh$/);
      if (m) return (parseFloat(m[1]) / 100) * window.innerHeight;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const recompute = () =>
      setSnaps({
        collapsed: resolve(sheetTop),
        expanded: resolve(expandedTop),
      });
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
    };
  }, [sheetTop, expandedTop]);

  // Sheet's current top edge in px. Drag updates it; snap animations
  // spring it to one of the two anchors.
  const top = useMotionValue<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapHeight, setMapHeight] = useState<number>(0);

  // Park sheet at collapsed once snaps resolve.
  useEffect(() => {
    if (snaps.collapsed <= 0) return;
    top.set(snaps.collapsed);
    setMapHeight(snaps.collapsed);
  }, [snaps.collapsed, top]);

  // Mirror sheet's live top to mapHeight so MapView's visible area
  // (and its floating controls) tracks the drag in real time.
  useEffect(() => {
    const unsub = top.on("change", (v) => setMapHeight(v));
    return unsub;
  }, [top]);

  const animateTo = useCallback(
    (target: number, velocity = 0) => {
      animate(top, target, {
        type: "spring",
        bounce: 0.18,
        velocity,
        duration: 0.4,
      });
    },
    [top],
  );

  const snapTo = useCallback(
    (expanded: boolean, velocity = 0) => {
      setIsExpanded(expanded);
      animateTo(expanded ? snaps.expanded : snaps.collapsed, velocity);
    },
    [animateTo, snaps.collapsed, snaps.expanded],
  );

  /* ─── Touch-gesture logic ─────────────────────────────────────────
   * Decide ONCE per gesture whether the touch drags the sheet or
   * scrolls the content underneath. The decision depends on:
   *
   *   1. Sheet state (collapsed vs expanded)
   *   2. Content scroll position (only matters when expanded)
   *   3. Swipe direction (only matters when expanded + at top)
   *
   * Rules:
   *   - Collapsed → ANY touch drags the sheet (content can't scroll
   *     because it's mostly off-screen anyway).
   *   - Expanded + content scrolled (>0) → native scroll, sheet
   *     stays put.
   *   - Expanded + content at top + swipe DOWN → drag the sheet
   *     down (toward collapsed).
   *   - Expanded + content at top + swipe UP → native scroll.
   *
   * Once the mode is decided for a gesture, we stick with it until
   * touchend — switching mid-gesture feels janky.
   * ─────────────────────────────────────────────────────────────── */

  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number>(0);
  const startSheetTopRef = useRef<number>(0);
  const dragModeRef = useRef<"sheet" | "content" | null>(null);
  const lastMoveYRef = useRef<number>(0);
  const lastMoveTimeRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);

  const onTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const y = e.touches[0]?.clientY ?? 0;
      touchStartYRef.current = y;
      lastMoveYRef.current = y;
      lastMoveTimeRef.current = performance.now();
      startSheetTopRef.current = top.get();
      dragModeRef.current = null; // decided on first move
      velocityRef.current = 0;
    },
    [top],
  );

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const y = e.touches[0]?.clientY ?? 0;
      const deltaY = y - touchStartYRef.current; // +ve = swipe DOWN, -ve = swipe UP

      // Decide drag mode on the first meaningful move.
      if (dragModeRef.current === null) {
        if (Math.abs(deltaY) < 4) return;
        const expandedNow = startSheetTopRef.current <= snaps.expanded + 8;
        const contentTop = contentScrollRef.current?.scrollTop ?? 0;
        if (!expandedNow) {
          dragModeRef.current = "sheet";
        } else if (contentTop > 0) {
          dragModeRef.current = "content";
        } else if (deltaY > 0) {
          // Swipe down at content top while expanded → collapse sheet.
          dragModeRef.current = "sheet";
        } else {
          // Swipe up while expanded + at top → let content scroll.
          dragModeRef.current = "content";
        }
      }

      if (dragModeRef.current === "sheet") {
        // Move the sheet. Clamp to [expanded, collapsed].
        const next = Math.max(
          snaps.expanded,
          Math.min(snaps.collapsed, startSheetTopRef.current + deltaY),
        );
        top.set(next);
        // Track velocity for snap-on-release physics.
        const now = performance.now();
        const dt = now - lastMoveTimeRef.current;
        if (dt > 0) {
          velocityRef.current = ((y - lastMoveYRef.current) / dt) * 1000; // px/sec
        }
        lastMoveYRef.current = y;
        lastMoveTimeRef.current = now;
      }
      // If "content" mode, do nothing — native scroll handles it.
    },
    [snaps.collapsed, snaps.expanded, top],
  );

  const onTouchEnd = useCallback(() => {
    if (dragModeRef.current === "sheet") {
      const v = velocityRef.current; // +ve = downward flick → collapse, -ve = upward → expand
      const current = top.get();
      // Hard flick wins.
      if (v < -400) {
        snapTo(true, v);
      } else if (v > 400) {
        snapTo(false, v);
      } else {
        // Snap to whichever anchor is closer.
        const midpoint = (snaps.collapsed + snaps.expanded) / 2;
        snapTo(current < midpoint, v);
      }
    }
    dragModeRef.current = null;
  }, [snapTo, snaps.collapsed, snaps.expanded, top]);

  // Tap on the handle still toggles for users who don't discover the
  // scroll-to-expand gesture.
  const toggleSheet = useCallback(() => {
    if (snaps.collapsed <= 0) return;
    snapTo(!isExpanded);
  }, [isExpanded, snapTo, snaps.collapsed]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="-mx-4 -my-4 relative h-[calc(100dvh-3.5rem)] overflow-hidden">
        {/* Map sized to the live top edge of the sheet, so floating
         controls inside it (locate-me, fullscreen) always sit just
         above the sheet's top edge instead of hiding behind it. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{ height: mapHeight > 0 ? `${mapHeight}px` : sheetTop }}
        >
          {map}
        </div>

        {mapBadge && (
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
            {mapBadge}
          </div>
        )}

        {/* Bottom sheet — `top` motion-value drives its position. */}
        <m.div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)]"
          style={{ top }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/* Drag handle hint — visual cue + tap-to-toggle backup. */}
          <button
            type="button"
            onClick={toggleSheet}
            aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
            className="flex h-6 shrink-0 items-center justify-center pt-2"
          >
            <span className="h-1.5 w-10 rounded-full bg-line" />
          </button>

          {/* Scrollable content. `touch-action: pan-y` lets the
         browser hand off vertical scroll to us via touch events
         (we decide whether to scroll or drag-sheet per gesture);
         `overscroll-contain` stops the browser from also chaining
         the scroll to the parent when we drag the sheet at the
         content's top edge. */}
          <div
            ref={contentScrollRef}
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-4 pt-1"
          >
            {children}
          </div>

          {actionBar && (
            <div
              className="shrink-0 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur"
              style={{
                paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
              }}
            >
              {actionBar}
            </div>
          )}
        </m.div>
      </div>
    </LazyMotion>
  );
}
