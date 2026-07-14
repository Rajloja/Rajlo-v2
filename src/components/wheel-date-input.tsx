"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * iOS-style wheel date picker.
 *
 * Three scrollable columns — Day / Month / Year — with the middle
 * row highlighted as the currently-selected value. Tapping the read-only
 * input opens a bottom sheet (mobile) / centered modal (desktop) with
 * the wheels; Done writes the selected ISO date back through onChange.
 *
 * Contract matches the previous typed-text DateInput so switching call
 * sites is a same-props swap:
 *   - `value` is ISO `YYYY-MM-DD` or "".
 *   - `onChange` fires with a valid ISO string when the user hits Done,
 *     or "" if they cancel from an empty state.
 *
 * Day list clamps automatically to the picked month/year — Feb 30 can't
 * be selected because the day column only renders 1..28/29.
 */

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function daysInMonth(year: number, monthOneIndexed: number): number {
  // Trick: day 0 of month+1 is the last day of month.
  return new Date(year, monthOneIndexed, 0).getDate();
}

function parseIso(iso: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

export function WheelDateInput({
  label,
  value,
  onChange,
  hint,
  required,
  minYear = 1930,
  maxYear,
  placeholder = "Tap to pick date",
}: {
  label: string;
  /** ISO date `YYYY-MM-DD` (or "" when unset). */
  value: string;
  onChange: (iso: string) => void;
  hint?: string;
  required?: boolean;
  /** Earliest year selectable. Default 1930 — covers DOB. */
  minYear?: number;
  /** Latest year selectable. Default currentYear + 15 — covers doc expiries. */
  maxYear?: number;
  placeholder?: string;
}) {
  const currentYear = new Date().getFullYear();
  const effectiveMaxYear = maxYear ?? currentYear + 15;

  const [open, setOpen] = useState(false);

  const seed = useMemo(() => {
    const parsed = parseIso(value);
    if (parsed) return parsed;
    // Default to today when unset — most doc-expiry fields will be
    // months out; today is a sane starting position.
    const today = new Date();
    return { day: today.getDate(), month: today.getMonth() + 1, year: today.getFullYear() };
  }, [value]);

  // Draft state that only writes back on Done. This way Cancel truly
  // discards changes.
  const [draftYear, setDraftYear] = useState(seed.year);
  const [draftMonth, setDraftMonth] = useState(seed.month);
  const [draftDay, setDraftDay] = useState(seed.day);

  // Reset draft to current value when the sheet opens — so re-opening
  // after cancel doesn't leak the abandoned draft.
  useEffect(() => {
    if (open) {
      setDraftYear(seed.year);
      setDraftMonth(seed.month);
      setDraftDay(seed.day);
    }
  }, [open, seed.year, seed.month, seed.day]);

  // Clamp draft day when month/year changes so we can never end up
  // pointing at Feb 30.
  const maxDay = daysInMonth(draftYear, draftMonth);
  useEffect(() => {
    if (draftDay > maxDay) setDraftDay(maxDay);
  }, [draftDay, maxDay]);

  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay],
  );
  const monthValues = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1),
    [],
  );
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = minYear; y <= effectiveMaxYear; y++) arr.push(y);
    return arr;
  }, [minYear, effectiveMaxYear]);

  const display = useMemo(() => {
    const parsed = parseIso(value);
    if (!parsed) return "";
    // "14 Jul 2026" — locale-neutral, unambiguous, fits in the input.
    return `${parsed.day} ${MONTHS_SHORT[parsed.month - 1]} ${parsed.year}`;
  }, [value]);

  const confirm = () => {
    const clampedDay = Math.min(draftDay, maxDay);
    const iso = `${draftYear}-${pad(draftMonth)}-${pad(clampedDay)}`;
    onChange(iso);
    setOpen(false);
  };

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">
          {label}
          {required && <span className="ml-0.5 text-rajlo-red">*</span>}
        </span>
        {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`w-full rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm outline-none transition-all focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15 ${
            display ? "text-foreground" : "text-muted/70"
          }`}
        >
          {display || placeholder}
        </button>
      </label>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-surface p-4 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm font-medium text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <p className="text-sm font-semibold">{label}</p>
              <button
                type="button"
                onClick={confirm}
                className="rounded-md px-2 py-1 text-sm font-bold text-rajlo-red hover:bg-primary-soft"
              >
                Done
              </button>
            </div>

            <div
              className="relative flex overflow-hidden rounded-2xl bg-surface-soft"
              style={{ height: CONTAINER_HEIGHT }}
            >
              {/* Center highlight pill — must sit BEHIND the wheels or
                  it paints over the selected item's text (absolute
                  elements normally paint above static siblings). Explicit
                  z-0 on the pill + z-10 on each column below sorts the
                  stacking so the pill is a background band, not an
                  overlay. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-2 right-2 z-0 rounded-xl bg-primary-soft"
                style={{
                  top: (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2,
                  height: ITEM_HEIGHT,
                }}
              />
              <WheelColumn
                items={days}
                selected={Math.min(draftDay, maxDay)}
                onSelect={setDraftDay}
                render={(d) => String(d)}
              />
              <WheelColumn
                items={monthValues}
                selected={draftMonth}
                onSelect={setDraftMonth}
                render={(m) => MONTHS_SHORT[m - 1]}
              />
              <WheelColumn
                items={years}
                selected={draftYear}
                onSelect={setDraftYear}
                render={(y) => String(y)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One vertical scrolling column. Padded top/bottom by (VISIBLE_ROWS-1)/2
 *  rows so the first and last real items can center under the highlight
 *  pill. Scroll-snap on the items handles the "clicks into place" feel;
 *  the debounced settle-detector rounds imprecise scrollTop to the
 *  nearest whole item + fires onSelect.
 *
 *  Reserved for scroll interaction — items are visually clickable but
 *  we deliberately don't render onClick handlers, matching the iOS
 *  wheel-picker mental model.
 */
function WheelColumn<T extends number>({
  items,
  selected,
  onSelect,
  render,
}: {
  items: T[];
  selected: T;
  onSelect: (value: T) => void;
  render: (value: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimeout = useRef<number | null>(null);
  const suppressScrollHandler = useRef(false);

  // Sync scroll position to the current selected value. Suppressed
  // when we set scrollTop ourselves as part of settling — otherwise
  // the resulting scroll event would fire the settle handler again.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.indexOf(selected);
    if (idx < 0) return;
    const targetTop = idx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - targetTop) < 1) return;
    suppressScrollHandler.current = true;
    el.scrollTop = targetTop;
    // Release the suppression on the next microtask — the browser
    // fires the scroll event synchronously after the assignment on
    // most engines, so we're safe to re-enable after a tick.
    queueMicrotask(() => {
      suppressScrollHandler.current = false;
    });
  }, [selected, items]);

  const handleScroll = () => {
    if (suppressScrollHandler.current) return;
    if (settleTimeout.current !== null) window.clearTimeout(settleTimeout.current);
    settleTimeout.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const rawIdx = el.scrollTop / ITEM_HEIGHT;
      const clampedIdx = Math.max(
        0,
        Math.min(items.length - 1, Math.round(rawIdx)),
      );
      const item = items[clampedIdx];
      // Snap precisely to the item — the CSS scroll-snap will usually
      // handle this, but on some browsers a slow finger-flick leaves
      // scrollTop just off the target. This closes the gap.
      const target = clampedIdx * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - target) >= 1) {
        suppressScrollHandler.current = true;
        el.scrollTop = target;
        queueMicrotask(() => {
          suppressScrollHandler.current = false;
        });
      }
      if (item !== selected) onSelect(item);
    }, 90);
  };

  useEffect(() => {
    return () => {
      if (settleTimeout.current !== null) {
        window.clearTimeout(settleTimeout.current);
      }
    };
  }, []);

  const padRows = (VISIBLE_ROWS - 1) / 2;

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="relative z-10 flex-1 overflow-y-scroll [&::-webkit-scrollbar]:hidden"
      style={{
        scrollSnapType: "y mandatory",
        scrollbarWidth: "none",
      }}
    >
      {Array.from({ length: padRows }).map((_, i) => (
        <div key={`top-pad-${i}`} style={{ height: ITEM_HEIGHT }} />
      ))}
      {items.map((v) => (
        <div
          key={v}
          className={`flex items-center justify-center text-base transition-colors ${
            v === selected
              ? "font-bold text-rajlo-red"
              : "text-muted/60"
          }`}
          style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center" }}
        >
          {render(v)}
        </div>
      ))}
      {Array.from({ length: padRows }).map((_, i) => (
        <div key={`bot-pad-${i}`} style={{ height: ITEM_HEIGHT }} />
      ))}
    </div>
  );
}
