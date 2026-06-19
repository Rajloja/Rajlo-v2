"use client";

import { type ReactNode } from "react";

/**
 * Mobile bottom-sheet layout for rider screens.
 *
 * The pattern Uber uses: map fills the viewport behind a card that
 * slides up from the bottom. The card has a drag handle hint, a
 * scrollable content area, and an optional sticky action bar pinned
 * to the bottom of the sheet (not the viewport).
 *
 * We keep this pure-CSS — no JS drag gesture, no Framer Motion. The
 * card has a fixed top position relative to the viewport, scrolls
 * its own content, and stays out of the way of the map's gesture
 * area at the top.
 *
 * Wrap mobile-only content in this. Desktop layouts continue to use
 * their existing split-pane structure.
 *
 *   <RiderBottomSheet
 *     map={<MapView ... />}
 *     sheetTop="58vh"            // map shows above this; default 56vh
 *     actionBar={<ActionBar />}
 *   >
 *     {scrollableContent}
 *   </RiderBottomSheet>
 *
 * Used on:
 *   - /rider/request (booking screen)
 *   - /rider/live-trip (in-flight states)
 */
export function RiderBottomSheet({
  map,
  children,
  actionBar,
  /** Where the top of the sheet sits in the viewport. Lower = more
   *  map visible. CSS units (vh, %, px). Default 56vh leaves a bit
   *  over half the viewport for the map. */
  sheetTop = "56vh",
  /** Optional badge / pill / breadcrumb anchored to the top-left of
   *  the map area (above the sheet). Common use: "BOOKING" or "LIVE"
   *  badge that floats over the map. */
  mapBadge,
}: {
  map: ReactNode;
  children: ReactNode;
  actionBar?: ReactNode;
  sheetTop?: string;
  mapBadge?: ReactNode;
}) {
  return (
    // Negative margins cancel PortalLayout's px-4/py-4 wrapper padding
    // so the sheet bleeds to the viewport edges on mobile.
    //
    // `100dvh` instead of `100vh`: on iOS Safari (and modern Chrome),
    // `100vh` counts the full viewport INCLUDING the area covered by
    // the URL bar at the bottom, which means our sheet's bottom edge
    // slips UNDER the URL bar and clips the action button. `100dvh`
    // (dynamic viewport height) excludes browser chrome, so the sheet
    // stays fully inside the visible area as the bar collapses.
    <div className="-mx-4 -my-4 relative h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* Map fills the entire stage. Sheet sits on top of it. */}
      <div className="absolute inset-0">{map}</div>

      {mapBadge && (
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
          {mapBadge}
        </div>
      )}

      {/* Bottom sheet — anchored to the bottom, scrollable inside. */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.18)]"
        style={{ top: sheetTop }}
      >
        {/* Drag handle hint — visual cue only, no actual drag yet. */}
        <div className="pointer-events-none flex h-4 shrink-0 items-center justify-center pt-2">
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>

        {/* Scrollable content. min-h-0 + flex-1 = canonical fix so the
         flex child can shrink below content height and scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {children}
        </div>

        {actionBar && (
          // safe-area-inset-bottom adds extra padding so the primary
          // button sits ABOVE the iOS home indicator / Safari URL
          // bar instead of being half-covered. The CSS env() resolves
          // to 0 on browsers without notches, so this is harmless on
          // desktop and Android Chrome.
          <div
            className="shrink-0 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur"
            style={{
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
            }}
          >
            {actionBar}
          </div>
        )}
      </div>
    </div>
  );
}
