"use client";

import { Icon } from "@/components/icons";
import { haptics } from "@/lib/native";

/**
 * Right-side stack of floating controls for the in-app turn-by-turn
 * navigator.
 *
 * Buttons (top → bottom):
 *   - Recenter: shown only when the camera has been disengaged
 *     (driver panned the map). One tap re-engages camera-follow.
 *   - Voice mute toggle: always shown.
 *
 * Layout floats above the map at the right edge with safe-area
 * padding so it doesn't crash into the system bezel on notched phones.
 */
export function NavControls({
  cameraDisengaged,
  onRecenter,
  muted,
  onToggleMute,
  onMinimize,
}: {
  cameraDisengaged: boolean;
  onRecenter: () => void;
  muted: boolean;
  onToggleMute: () => void;
  /** Tapped to collapse the fullscreen nav surface back into the
   *  regular trip page layout. Omitted when nav is already embedded. */
  onMinimize?: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3"
      style={{
        // Push the stack down a touch so it doesn't collide with the
        // top-of-screen NavBanner. The translate-y-1/2 still vertically
        // centers it within the remaining space.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)",
      }}
    >
      {onMinimize && (
        <button
          type="button"
          aria-label="Minimize navigation"
          onClick={() => {
            void haptics.tap();
            onMinimize();
          }}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-rajlo-black shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
        >
          {/* Minimize / collapse icon — two arrows pointing inward. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M4 14h6v6" />
            <path d="M20 10h-6V4" />
            <path d="M14 10l7-7" />
            <path d="M3 21l7-7" />
          </svg>
        </button>
      )}

      {cameraDisengaged && (
        <button
          type="button"
          aria-label="Recenter map"
          onClick={() => {
            void haptics.tap();
            onRecenter();
          }}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-rajlo-black shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
        >
          <Icon name="navigation" className="h-5 w-5" />
        </button>
      )}

      <button
        type="button"
        aria-label={muted ? "Unmute voice" : "Mute voice"}
        onClick={() => {
          void haptics.tap();
          onToggleMute();
        }}
        className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-rajlo-black shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
      >
        {muted ? (
          // Speaker with a slash through it — muted.
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M23 9l-6 6" />
            <path d="M17 9l6 6" />
          </svg>
        ) : (
          // Speaker with sound waves — voice on.
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a9 9 0 0 1 0 14" />
          </svg>
        )}
      </button>
    </div>
  );
}
