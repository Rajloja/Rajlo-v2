"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * A multi-line text field that, on MOBILE, opens a full-screen editor
 * overlay when tapped instead of typing inline. Same rationale as
 * PlacesAutocomplete's search overlay: a textarea living inside the
 * rider bottom-sheet ends up fighting the on-screen keyboard (the
 * field gets shoved behind it / the action bar slips out of view).
 * Editing in a top-anchored full-screen overlay — textarea at the top,
 * keyboard at the bottom — sidesteps all of that on every mobile
 * browser.
 *
 * On DESKTOP it's a plain inline `<textarea>` (no overlay).
 */
export function NoteField({
  value,
  onChange,
  placeholder,
  label,
  rows = 2,
  maxLength,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Heading shown at the top of the mobile editor overlay. */
  label: string;
  /** Visible rows for the desktop inline textarea / collapsed preview. */
  rows?: number;
  maxLength?: number;
}) {
  const { isMobile, mounted } = useIsMobile();
  const mobile = mounted && isMobile;

  const [expanded, setExpanded] = useState(false);
  // Kept always-mounted (overlay rendered but hidden when collapsed) so
  // we can focus it synchronously inside the tap gesture — iOS only
  // raises the keyboard for a focus() that happens in a user gesture.
  const overlayRef = useRef<HTMLTextAreaElement>(null);
  const blockReopenRef = useRef(false);

  // Lock body scroll while the editor is open.
  useEffect(() => {
    if (!expanded) return;
    if (typeof document === "undefined") return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [expanded]);

  const open = () => {
    const el = overlayRef.current;
    el?.focus();
    setExpanded(true);
    // Drop the caret at the end so the rider continues their note.
    requestAnimationFrame(() => {
      if (el) el.selectionStart = el.selectionEnd = el.value.length;
    });
  };

  const close = () => {
    setExpanded(false);
    overlayRef.current?.blur();
    blockReopenRef.current = true;
    setTimeout(() => {
      blockReopenRef.current = false;
    }, 350);
  };

  const onTriggerFocus = () => {
    if (blockReopenRef.current) return;
    overlayRef.current?.focus();
    setExpanded(true);
  };

  if (!mobile) {
    return (
      <textarea
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-line bg-surface-soft px-4 py-3 text-sm outline-none transition-all placeholder:text-muted/70 focus:border-rajlo-red focus:ring-2 focus:ring-rajlo-red/15"
      />
    );
  }

  return (
    <>
      {/* Collapsed trigger — looks like the textarea, opens the editor. */}
      <button
        type="button"
        onClick={open}
        onFocus={onTriggerFocus}
        className="mt-2 block w-full rounded-xl border border-line bg-surface-soft px-4 py-3 text-left text-sm transition-all hover:border-rajlo-red/30"
      >
        {value ? (
          <span className="block whitespace-pre-wrap break-words line-clamp-2 text-foreground">
            {value}
          </span>
        ) : (
          <span className="block text-muted/70">{placeholder}</span>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <div
            className={`fixed inset-0 flex flex-col bg-surface transition-opacity duration-150 ${
              expanded
                ? "z-70 opacity-100"
                : "-z-10 opacity-0 pointer-events-none"
            }`}
            aria-hidden={!expanded}
          >
            <div
              className="flex items-center gap-2 border-b border-line bg-surface px-3 pb-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Back"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-surface-soft"
              >
                <Icon name="chevron-left" className="h-5 w-5" />
              </button>
              <span className="flex-1 truncate text-sm font-bold text-foreground">
                {label}
              </span>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-full px-4 py-2 text-sm font-bold text-rajlo-red hover:bg-primary-soft"
              >
                Done
              </button>
            </div>

            <div className="min-h-0 flex-1 px-4 py-3">
              <textarea
                ref={overlayRef}
                value={value}
                maxLength={maxLength}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                enterKeyHint="done"
                className="h-full w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted/70"
              />
            </div>

            {maxLength && (
              <div className="border-t border-line px-4 py-2 text-right text-xs text-muted">
                {value.length}/{maxLength}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
