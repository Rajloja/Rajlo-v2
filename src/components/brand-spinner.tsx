"use client";

import { LogoIcon } from "./logo";

/**
 * Branded loading spinner — replaces the generic red ring used across
 * the app with the Rajlo wordmark's `o` + arc rotating in brand red.
 * Same purpose, more brand presence on every wait.
 *
 *   <BrandSpinner />                      // inline, fits a button
 *   <BrandSpinner size="lg" />            // bigger inline
 *   <BrandSpinner variant="centered" />   // for full-section loading
 *   <BrandSpinner variant="centered" label="Hold on…" />
 *
 * Why animate the brand mark instead of a generic ring: every wait
 * across the product becomes a moment the brand is on screen — the
 * "subtle uplift" Raj asked for, no extra layout cost.
 */

type Size = "sm" | "md" | "lg";
type Variant = "inline" | "centered";

const SIZE_PX: Record<Size, number> = {
  sm: 16,
  md: 24,
  lg: 40,
};

export function BrandSpinner({
  size = "md",
  variant = "inline",
  label,
  className = "",
}: {
  size?: Size;
  variant?: Variant;
  /** Small caption rendered under the spinner. `centered` variant only. */
  label?: string;
  className?: string;
}) {
  const px = SIZE_PX[size];

  const spinner = (
    <LogoIcon
      height={px}
      // `animate-spin` rotates the whole icon (the `o` + arc) at the
      // Tailwind default 1s/turn. `text-rajlo-red` sets the
      // currentColor that LogoIcon's SVG paths fill with.
      className={`animate-spin text-rajlo-red ${className}`}
    />
  );

  if (variant === "centered") {
    return (
      <div className="grid place-items-center gap-3 py-8">
        {spinner}
        {label && (
          <p className="font-secondary text-[11px] font-bold uppercase tracking-wider text-muted">
            {label}
          </p>
        )}
      </div>
    );
  }

  return spinner;
}
