"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LazyMotion, domAnimation, m, useMotionValue, animate } from "motion/react";

/**
 * Mobile bottom-sheet layout for rider screens.
 *
 * Two snap points (Uber-style):
 *   - "collapsed" — sheet sits at `sheetTop` (default 50vh), map shows
 *     above. The default state on page load. The action bar at the
 *     bottom is always visible.
 *   - "expanded"  — sheet rises to `expandedTop` (default 8vh), nearly
 *     fullscreen. A small map peek stays visible at the very top so
 *     the rider doesn't lose all spatial context.
 *
 * Gestures:
 *   - Drag the handle / sheet header up/down to toggle states. We
 *     snap to the nearest state on release based on position + drag
 *     velocity (a flick up always expands, a flick down always
 *     collapses).
 *   - Scrolling the content area is normal vertical scrolling. The
 *     map below the sheet is fully tappable when collapsed (in the
 *     gap above the sheet).
 *
 * The map container is sized to the SHEET'S CURRENT TOP so MapView's
 * floating controls (locate-me button, etc.) sit at the bottom-right
 * of the actually-visible map area — never hidden behind the sheet.
 *
 * Wrap mobile-only content in this. Desktop layouts continue to use
 * their existing split-pane structure.
 */
export function RiderBottomSheet({
  map,
  children,
  actionBar,
  /** Where the top of the sheet sits when collapsed. Default 50vh. */
  sheetTop = "50vh",
  /** Where the top of the sheet sits when expanded. Default 8vh — a
   *  thin map peek stays visible above. */
  expandedTop = "8vh",
  /** Optional badge / pill anchored to the top-left of the map area
   *  (above the sheet). */
  mapBadge,
}: {
  map: ReactNode;
  children: ReactNode;
  actionBar?: ReactNode;
  sheetTop?: string;
  expandedTop?: string;
  mapBadge?: ReactNode;
}) {
  // Resolve the vh-based snap points to px once on mount + on viewport
  // resize. We need real px because Framer's drag/animate API works on
  // numeric values, and we want to clamp drag against the available
  // pixel range — not against a CSS percentage.
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

  // `top` is the sheet's current top edge in CSS px. Drag updates it;
  // snap animations spring it to one of the two anchor values.
  const top = useMotionValue<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapHeight, setMapHeight] = useState<number>(0);

  // Once we know the snap values, park the sheet at collapsed.
  useEffect(() => {
    if (snaps.collapsed <= 0) return;
    top.set(snaps.collapsed);
    setMapHeight(snaps.collapsed);
  }, [snaps.collapsed, top]);

  // Keep `mapHeight` in sync with the sheet's live top so MapView's
  // visible area shrinks/grows during the drag — the locate-me button
  // tracks the sheet edge instead of jumping at the end of the
  // animation.
  useEffect(() => {
    const unsub = top.on("change", (v) => setMapHeight(v));
    return unsub;
  }, [top]);

  const animateTo = useCallback(
    (target: number, opts?: { velocity?: number }) => {
      animate(top, target, {
        type: "spring",
        bounce: 0.18,
        velocity: opts?.velocity ?? 0,
        duration: 0.4,
      });
    },
    [top],
  );

  // Snap-on-release logic — pick whichever anchor (collapsed/expanded)
  // we'd reach faster given the current position + flick velocity.
  const handleDragEnd = useCallback(
    (_event: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const currentTop = top.get();
      const v = info.velocity.y;
      // Strong flick wins regardless of position.
      if (v < -300) {
        setIsExpanded(true);
        animateTo(snaps.expanded, { velocity: v });
        return;
      }
      if (v > 300) {
        setIsExpanded(false);
        animateTo(snaps.collapsed, { velocity: v });
        return;
      }
      // Otherwise snap to whichever anchor is closer.
      const midpoint = (snaps.collapsed + snaps.expanded) / 2;
      if (currentTop < midpoint) {
        setIsExpanded(true);
        animateTo(snaps.expanded);
      } else {
        setIsExpanded(false);
        animateTo(snaps.collapsed);
      }
    },
    [animateTo, snaps.collapsed, snaps.expanded, top],
  );

  // Tap-to-toggle on the drag handle. Useful for users who don't
  // drag-discover the feature.
  const toggleSheet = useCallback(() => {
    if (snaps.collapsed <= 0) return;
    if (isExpanded) {
      setIsExpanded(false);
      animateTo(snaps.collapsed);
    } else {
      setIsExpanded(true);
      animateTo(snaps.expanded);
    }
  }, [animateTo, isExpanded, snaps.collapsed, snaps.expanded]);

  return (
    // Negative margins cancel PortalLayout's px-4/py-4 wrapper padding
    // so the sheet bleeds to the viewport edges on mobile.
    <LazyMotion features={domAnimation} strict>
      <div className="-mx-4 -my-4 relative h-[calc(100dvh-3.5rem)] overflow-hidden">
        {/* Map sized to the live top edge of the sheet, so floating
         controls inside it (locate-me, fullscreen) always sit just
         above the sheet's top instead of hiding behind it. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: mapHeight > 0 ? `${mapHeight}px` : sheetTop,
          }}
        >
          {map}
        </div>

        {mapBadge && (
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
            {mapBadge}
          </div>
        )}

        {/* Bottom sheet — anchored via `top` motion-value. Drag moves
         it within [expanded, collapsed]. */}
        <m.div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)]"
          style={{ top }}
          drag="y"
          dragConstraints={{
            top: snaps.expanded,
            bottom: snaps.collapsed,
          }}
          dragElastic={0.05}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
        >
          {/* Drag handle area — also a tap target. */}
          <button
            type="button"
            onClick={toggleSheet}
            aria-label={isExpanded ? "Collapse sheet" : "Expand sheet"}
            className="flex h-6 shrink-0 cursor-grab items-center justify-center pt-2 active:cursor-grabbing"
          >
            <span className="h-1.5 w-10 rounded-full bg-line" />
          </button>

          {/* Scrollable content. min-h-0 + flex-1 = canonical flex
         scrollable child trick. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">
            {children}
          </div>

          {actionBar && (
            // Sticky action bar at the bottom of the sheet — visible
            // whether collapsed or expanded. safe-area-inset-bottom
            // keeps the primary button above iOS Safari's URL bar
            // and the home indicator.
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
