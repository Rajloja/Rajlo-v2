"use client";

import Link from "next/link";
import { LogoIcon } from "./logo";
import { ArcWatermark } from "./arc-pattern";

/**
 * Brand-aware empty state — used in lists, inboxes, and "no data yet"
 * screens so they feel like Rajlo surfaces instead of plain text.
 *
 * Two variants:
 *   - `soft` (default): dashed card, gentle background. For inline
 *     spots like a notifications list with zero items.
 *   - `hero`: red-accented full-width card with the arc watermark.
 *     For empty primary surfaces (rider dashboard before a first
 *     trip, driver inbox with no requests).
 *
 * Replaces ~5 inline empty-state divs scattered across the rider +
 * driver pages — they all had the same "icon + title + body + CTA"
 * shape, written by hand each time.
 */
export function EmptyState({
  title,
  body,
  cta,
  variant = "soft",
  className = "",
}: {
  title: string;
  body?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  variant?: "soft" | "hero";
  className?: string;
}) {
  const containerClass =
    variant === "hero"
      ? "relative overflow-hidden rounded-3xl border border-rajlo-red/20 bg-gradient-to-br from-primary-soft/40 via-surface to-surface px-6 py-14 text-center"
      : "relative overflow-hidden rounded-3xl border border-dashed border-line bg-surface-soft px-6 py-10 text-center";

  const markClass =
    variant === "hero"
      ? "bg-rajlo-red text-white shadow-lg shadow-rajlo-red/30"
      : "bg-primary-soft text-rajlo-red";

  return (
    <div className={`${containerClass} ${className}`}>
      {/* Branded watermark on the hero variant only — keeps the soft
         variant from feeling busy when stacked into a list. */}
      {variant === "hero" && (
        <ArcWatermark
          variant="red"
          size={280}
          className="pointer-events-none absolute -bottom-16 -right-12 opacity-25"
        />
      )}
      <div className="relative grid place-items-center gap-3">
        <span
          className={`grid h-14 w-14 place-items-center rounded-2xl ${markClass}`}
        >
          <LogoIcon height={28} />
        </span>
        <h3 className="text-base font-extrabold tracking-tight text-foreground">
          {title}
        </h3>
        {body && (
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            {body}
          </p>
        )}
        {cta && <CtaButton {...cta} />}
      </div>
    </div>
  );
}

function CtaButton({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const cls =
    "mt-2 inline-flex items-center gap-2 rounded-full bg-rajlo-red px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-primary-hover";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  );
}
