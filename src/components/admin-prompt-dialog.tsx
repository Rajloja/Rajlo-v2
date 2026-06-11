"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Reusable admin confirmation / prompt dialog.
 *
 * Replaces ad-hoc `window.prompt` / `window.confirm` usage scattered
 * across the admin surface. Wins over the native prompt:
 *
 *   - Branded UI that matches the rest of the admin (Rajlo-black
 *     header bar, brand-red accents on destructive actions).
 *   - Multi-line input where it makes sense (reasons, investigation
 *     summaries, resolution notes).
 *   - **Quick-suggestion chips** — most admin actions have a handful
 *     of common phrasings ("Repeated complaints", "GPS spoofing
 *     confirmed", etc.). Tapping a chip pre-fills the input so the
 *     admin just hits Confirm. Reduces both typos and "what should
 *     I write" friction.
 *   - Async confirm callback support — the dialog disables both
 *     buttons + shows a spinner while the action is in flight so
 *     the admin can't double-fire.
 *   - Standard a11y wiring: role=dialog, aria-modal, focus-trap on
 *     the input, Escape closes, click-outside cancels (when not
 *     busy), labelled-by header.
 *
 * Used by fraud enforcement actions, raise-flag, open-investigation,
 * resolve-flag, release-payout-hold, and the safety acknowledge
 * confirm (latter being a no-input variant — pass `inputType="none"`).
 */

export type DialogTone = "neutral" | "amber" | "red" | "emerald";

const TONE_BUTTON: Record<DialogTone, string> = {
  neutral:
    "bg-rajlo-black text-white hover:bg-rajlo-black/90",
  amber:
    "bg-amber-500 text-white hover:bg-amber-600",
  red:
    "bg-rajlo-red text-white hover:bg-primary-hover",
  emerald:
    "bg-emerald-600 text-white hover:bg-emerald-700",
};

const TONE_ICON_BG: Record<DialogTone, string> = {
  neutral: "bg-surface-soft text-rajlo-black",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-rajlo-red/10 text-rajlo-red",
  emerald: "bg-emerald-100 text-emerald-700",
};

export type AdminPromptDialogProps = {
  /** Mount + open the dialog when true. */
  open: boolean;
  title: string;
  /** Optional helper copy under the title. */
  description?: string;
  /** Icon shown next to the title. Defaults sensibly per tone. */
  icon?: IconName;
  /** Visual + button tone. Drives confirm-button colour + header icon
   *  tint. Default `red` for destructive actions. */
  tone?: DialogTone;
  /** "text" (single line), "textarea" (multi-line), or "none"
   *  (no input — pure confirm). Default `textarea`. */
  inputType?: "text" | "textarea" | "none";
  /** Label rendered above the input. */
  inputLabel?: string;
  placeholder?: string;
  /** Initial input value — useful for "edit" dialogs that pre-fill. */
  initialValue?: string;
  /** When true, the Confirm button is disabled until the input has
   *  non-whitespace content. Default true for `text`/`textarea`. */
  requireValue?: boolean;
  /** Suggestion chips. Clicking a chip writes its text into the
   *  input (replaces existing content). Ignored for `inputType="none"`. */
  chips?: string[];
  /** Button text. Default "Confirm". */
  confirmLabel?: string;
  /** Button text. Default "Cancel". */
  cancelLabel?: string;
  /** Disables both buttons + shows a spinner on the confirm button. */
  busy?: boolean;
  /** Fired when the admin commits. For input dialogs, gets the input
   *  value (already trimmed). For `inputType="none"` gets `""`. May
   *  be async — the dialog respects `busy` while it's in flight. */
  onConfirm: (value: string) => void | Promise<void>;
  /** Fired on Cancel, outside-click, or Escape. */
  onCancel: () => void;
};

export function AdminPromptDialog({
  open,
  title,
  description,
  icon,
  tone = "red",
  inputType = "textarea",
  inputLabel,
  placeholder,
  initialValue = "",
  requireValue,
  chips,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: AdminPromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset input whenever the dialog re-opens with a fresh action.
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  // Escape to cancel; focus the input on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    // Defer focus until after the dialog has mounted so the focus
    // ring lands on the input rather than the backdrop.
    const t = setTimeout(() => {
      if (inputType === "text") inputRef.current?.focus();
      else if (inputType === "textarea") textareaRef.current?.focus();
    }, 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, busy, onCancel, inputType]);

  if (!open) return null;

  const needsValue =
    inputType !== "none" && (requireValue ?? true) && !value.trim();

  const submit = async () => {
    if (busy || needsValue) return;
    await onConfirm(value.trim());
  };

  const resolvedIcon: IconName =
    icon ??
    (tone === "red"
      ? "shield-alert"
      : tone === "amber"
        ? "alert-triangle"
        : tone === "emerald"
          ? "check-circle"
          : "help-circle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-prompt-title"
      onClick={() => !busy && onCancel()}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-rajlo-black/55 backdrop-blur-sm px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_ICON_BG[tone]}`}
          >
            <Icon name={resolvedIcon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="admin-prompt-title"
              className="text-base font-extrabold tracking-tight"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-muted">{description}</p>
            )}
          </div>
        </div>

        {/* Input + chips */}
        {inputType !== "none" && (
          <div className="px-5 pt-4">
            {inputLabel && (
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted">
                {inputLabel}
              </label>
            )}
            {inputType === "text" ? (
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !needsValue) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                disabled={busy}
                placeholder={placeholder}
                className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm outline-none transition-colors focus:border-rajlo-red disabled:opacity-50"
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={busy}
                rows={3}
                placeholder={placeholder}
                className="w-full resize-none rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm outline-none transition-colors focus:border-rajlo-red disabled:opacity-50"
              />
            )}

            {chips && chips.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                  Quick reasons
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setValue(chip)}
                      disabled={busy}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-50 ${
                        value === chip
                          ? "border-rajlo-red bg-primary-soft text-rajlo-red"
                          : "border-line bg-surface text-foreground hover:border-rajlo-red/40 hover:bg-primary-soft/40"
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-line bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || needsValue}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${TONE_BUTTON[tone]}`}
          >
            {busy && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            )}
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
