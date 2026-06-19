"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

/**
 * Mobile bottom-sheet layout for rider screens.
 *
 * Built on vaul, which handles the scroll-controlled snap-point logic
 * natively (the same library Linear / Vercel / Cal.com use for their
 * mobile drawers). What the rider gets:
 *
 *   - Default state: drawer rests at the first snap point (0.5 → 50%
 *     of viewport). Map fills the upper half.
 *   - Swiping up anywhere on the drawer pulls it toward the second
 *     snap point (0.92 → nearly fullscreen). Vaul handles the
 *     scroll-to-expand handoff: pulling up first lifts the drawer,
 *     and only once it's at the top snap does normal content scroll
 *     kick in.
 *   - Swiping down at the top of the content collapses it back.
 *
 * The map stays mounted full-viewport behind the drawer — we don't
 * resize its container during drag (that was the source of the
 * "shaking map" jitter in the previous custom implementation). The
 * locate-me button gets pushed above the drawer's collapsed snap
 * point via `floatingControlsBottomPx` on MapView, passed by the
 * caller.
 *
 * `modal={false}` keeps the page underneath fully interactive.
 * `dismissible={false}` stops the drawer from closing entirely —
 * this is a persistent sheet, not a modal.
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
  // Two snap points: half-screen (default) and nearly-fullscreen.
  // Vaul lets us pass percentages as decimals (0–1).
  const SNAP_POINTS = [0.5, 0.92] as const;
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  // Stop iOS / Chrome pull-to-refresh AND stop the page from
  // scrolling vertically (PortalLayout puts `pb-20` on `<main>` for
  // the rider portal, which would otherwise let the body scroll by
  // ~5 rem as the rider swipes the sheet — dragging the map along
  // with it). We do BOTH on body:
  //   - overscroll-behavior: contain → no pull-to-refresh
  //   - overflow-y: hidden            → no page scroll
  // Restored on unmount so other rider pages keep their natural
  // scrollable layouts. Sticky navbar still works fine — it's
  // already inside a flex column that doesn't depend on body scroll.
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

  return (
    // Relative wrapper sized to the viewport-below-header. Negative
    // margins cancel PortalLayout's `px-4 py-4` so we bleed to the
    // viewport edges. `overflow-hidden` keeps the map clipped to
    // this box while vaul's portal'd drawer overlays from below.
    <div className="-mx-4 -my-4 relative h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* Map fills the stage and stays mounted. The drawer overlays
       it. The map's container DOES NOT resize during drag. */}
      <div className="absolute inset-0">{map}</div>

      {mapBadge && (
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
          {mapBadge}
        </div>
      )}

      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={[...SNAP_POINTS]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        // Force snap transitions to step through points in order
        // (collapsed ↔ expanded) — without this a fast flick can
        // overshoot and land between points, which read as glitchy.
        snapToSequentialPoint
        // Vaul tries to manage body scroll itself; we already do
        // that with the useEffect above and we have a non-modal
        // persistent sheet, so tell vaul to stay out of body styles.
        noBodyStyles
      >
        <Drawer.Portal>
          <Drawer.Content
            // Vaul positions this fixed to the viewport; size + slide
            // are driven by its internal transform. We layer in the
            // Rajlo brand chrome (rounded top, border, shadow) on top.
            className="fixed inset-x-0 bottom-0 z-20 flex h-[97dvh] flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)] outline-none"
          >
            {/* Drag handle — vaul renders the visual hint AND wires
             it up to the drag controller. */}
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" />

            <Drawer.Title className="sr-only">Booking sheet</Drawer.Title>

            {/* Scrollable content. Vaul handles the
             scroll-vs-drag handoff: while drawer is below the top
             snap, this area's scroll is locked and gestures lift
             the drawer; once at the top snap, normal scroll
             behaves. */}
            {/* Bottom padding leaves room for the page-level fixed
             action bar (rendered by the caller as a sibling, NOT
             inside this drawer) so the last line of scrollable
             content isn't hidden behind it. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-2">
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

/**
 * Helper that callers can use to figure out roughly how far to push
 * floating map controls (locate-me button, etc.) above the drawer's
 * collapsed snap so they aren't hidden behind it. Pass the result
 * straight to MapView's `floatingControlsBottomPx`.
 *
 * Re-evaluates on resize so rotations + browser-chrome collapses
 * keep the button properly anchored.
 */
export function useFloatingControlsOffset(snapFraction = 0.5) {
  const [px, setPx] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recompute = () =>
      setPx(Math.round(window.innerHeight * snapFraction));
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
