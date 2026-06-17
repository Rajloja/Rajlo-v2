"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "./icons";
import { ChatSheet } from "./chat-sheet";
import { useRideChat, type ChatMessage } from "@/lib/use-ride-chat";

/**
 * Drop-in chat surface used by both the rider live-trip page and the
 * driver active-trip page. Owns:
 *
 *   1. The `useRideChat` hook — loads + subscribes to messages from
 *      the moment the trip page mounts, NOT when the chat opens. So
 *      tapping the icon shows the conversation instantly.
 *
 *   2. The chat icon button itself, with a red-pill unread badge that
 *      sits on the top-right of the icon's circular frame.
 *
 *   3. A toast notification ("You have a new message") that pops up
 *      when an incoming message arrives while the sheet is closed.
 *      Auto-dismisses after 6 seconds; tapping it opens the chat.
 *
 *   4. The `<ChatSheet>` panel itself.
 *
 * This component is self-contained — pages just drop it next to the
 * call icon and pass the peer's display data. No state plumbing.
 */

export function ChatLauncher({
  rideId,
  myRole,
  peerName,
  peerAvatarUrl,
  peerPhone,
  rideActive,
  /** Visual variant.
   *    "dark" → circular icon button for the dark hero card
   *    "soft" → circular icon button for light surface cards
   *    "pill" → full-width pill button matching CallButton's shape,
   *             with "Message" label (or "Message (N)" when unread).
   *             Use this when Call + Message sit side-by-side as
   *             equal-weight CTAs on the rider/driver live-trip card. */
  variant = "dark",
  /** Override the icon size if the surrounding row is unusual.
   *  Ignored for the "pill" variant. */
  iconSize = 40,
}: {
  rideId: string;
  myRole: "rider" | "driver";
  peerName: string;
  peerAvatarUrl?: string | null;
  peerPhone?: string | null;
  rideActive: boolean;
  variant?: "dark" | "soft" | "pill";
  iconSize?: number;
}) {
  const searchParams = useSearchParams();
  // Auto-open the chat when the page is reached via a push-notification
  // deep-link (`?chat=1` query param). Reading from searchParams at
  // render time and seeding the state lazily avoids React 19's
  // setState-in-effect rule — we never have to flip the state from an
  // effect, the initial state IS the deep-link signal.
  const [open, setOpen] = useState(() => searchParams?.get("chat") === "1");

  // Once-per-mount cleanup: strip `?chat=1` from the URL so a tab
  // refresh or back/forward doesn't re-open the chat sheet over and
  // over. Pure side-effect, no setState.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("chat")) {
      url.searchParams.delete("chat");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const {
    messages,
    setMessages,
    loading,
    unreadCount,
    latestIncoming,
    markAllRead,
  } = useRideChat(rideId, myRole, { enabled: Boolean(rideId) });

  // On the DRIVER side, auto-open the chat the moment the rider sends
  // a new message — the driver is operating the vehicle and shouldn't
  // have to fish for the chat icon while moving. Riders DON'T get the
  // auto-open (their attention isn't safety-critical, and an unwanted
  // popover during browsing would be intrusive).
  //
  // We track the last id we auto-opened on so an externally-driven
  // sheet close doesn't immediately re-open from a stale latestIncoming.
  const lastAutoOpenedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (myRole !== "driver") return;
    if (!latestIncoming) return;
    if (lastAutoOpenedIdRef.current === latestIncoming.id) return;
    lastAutoOpenedIdRef.current = latestIncoming.id;
    setOpen(true);
  }, [latestIncoming, myRole]);

  return (
    <>
      {variant === "pill" ? (
        <ChatPillButton
          unreadCount={unreadCount}
          onClick={() => setOpen(true)}
        />
      ) : (
        <ChatIconButton
          unreadCount={unreadCount}
          variant={variant}
          size={iconSize}
          onClick={() => setOpen(true)}
        />
      )}

      <NewMessageToast
        message={latestIncoming}
        senderName={peerName}
        // Hide the toast as soon as the chat opens (markAllRead clears
        // latestIncoming via the hook, which removes the toast too).
        visible={!open}
        onOpen={() => setOpen(true)}
      />

      <ChatSheet
        open={open}
        onClose={() => setOpen(false)}
        rideId={rideId}
        myRole={myRole}
        peerName={peerName}
        peerAvatarUrl={peerAvatarUrl}
        peerPhone={peerPhone}
        rideActive={rideActive}
        messages={messages}
        setMessages={setMessages}
        loading={loading}
        markAllRead={markAllRead}
      />
    </>
  );
}

/* ─────────── Chat icon button with unread badge ─────────── */

function ChatIconButton({
  unreadCount,
  variant,
  size,
  onClick,
}: {
  unreadCount: number;
  variant: "dark" | "soft";
  size: number;
  onClick: () => void;
}) {
  const base =
    variant === "dark"
      ? "bg-white/15 text-white hover:bg-white/25 backdrop-blur"
      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        unreadCount > 0
          ? `Open chat — ${unreadCount} new message${unreadCount === 1 ? "" : "s"}`
          : "Open chat"
      }
      className={`relative grid shrink-0 place-items-center rounded-full shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 ${base}`}
      style={{ height: size, width: size }}
    >
      <Icon name="mail" className="h-4 w-4" />
      {unreadCount > 0 && (
        // Red badge on the top-right of the circle frame. Caps at 9+
        // so a chatty trip doesn't blow out the bubble width.
        <span className="absolute -top-1 -right-1 grid min-w-[20px] place-items-center rounded-full bg-rajlo-red px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-sm ring-2 ring-surface">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}

/* ─────────── Chat pill button (matches CallButton width) ─────────── */

/**
 * Wide pill variant of the chat trigger. Same dimensions as the
 * CallButton primary pill so the two sit side-by-side as equal-weight
 * CTAs on the rider/driver live-trip card. Label shows "Message"
 * normally; when there are unread messages it becomes "Message (3)".
 */
function ChatPillButton({
  unreadCount,
  onClick,
}: {
  unreadCount: number;
  onClick: () => void;
}) {
  const hasUnread = unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        hasUnread
          ? `Open chat — ${unreadCount} new message${unreadCount === 1 ? "" : "s"}`
          : "Open chat"
      }
      className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 ${
        hasUnread
          ? "border-rajlo-red bg-rajlo-red text-white shadow-md shadow-rajlo-red/30 hover:bg-primary-hover"
          : "border-line bg-surface text-foreground hover:border-rajlo-red/40 hover:text-rajlo-red"
      }`}
    >
      <Icon name="mail" className="h-4 w-4" />
      <span>
        Message
        {hasUnread && (
          <span className="ml-1 tabular-nums">
            ({unreadCount > 9 ? "9+" : unreadCount})
          </span>
        )}
      </span>
    </button>
  );
}

/* ─────────── New-message toast ─────────── */

function NewMessageToast({
  message,
  senderName,
  visible,
  onOpen,
}: {
  message: ChatMessage | null;
  senderName: string;
  visible: boolean;
  onOpen: () => void;
}) {
  // The "currently toasting" id is derived: it's whatever message
  // landed last, unless the user has already dismissed that exact id
  // OR the parent flipped visible off (chat opened / unread cleared).
  // Keeping this as derived state instead of an effect-driven flag
  // satisfies the react-hooks/set-state-in-effect rule and avoids the
  // double-render churn that pattern causes.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const activeId = visible && message ? message.id : null;
  const showing = activeId !== null && activeId !== dismissedId;

  // Auto-dismiss after 6 seconds. The timer's only job is to push
  // `dismissedId` forward; setState happens in the timer callback
  // (async), not in the effect body.
  useEffect(() => {
    if (!showing || !activeId) return;
    const timer = setTimeout(() => setDismissedId(activeId), 6000);
    return () => clearTimeout(timer);
  }, [showing, activeId]);

  if (!showing || !message) return null;

  // Snippet preview — for text we truncate; image/voice get a friendly
  // synthetic preview so the rider sees what kind of message landed.
  const preview =
    message.kind === "text"
      ? message.body.length > 90
        ? `${message.body.slice(0, 87)}…`
        : message.body
      : message.kind === "image"
        ? "📷 Sent a photo"
        : "🎤 Sent a voice note";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 left-4 z-[80] mx-auto max-w-sm sm:left-auto sm:right-6 sm:top-6"
    >
      <button
        type="button"
        onClick={() => {
          if (activeId) setDismissedId(activeId);
          onOpen();
        }}
        className="group flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-2xl shadow-rajlo-black/20 transition-all hover:-translate-y-0.5 hover:border-rajlo-red"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rajlo-red text-white">
          <Icon name="mail" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-extrabold tracking-tight">
              You have a new message
            </p>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-rajlo-red">
              Now
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            <span className="font-bold text-foreground">{senderName}</span>{" "}
            · {preview}
          </p>
          <p className="mt-1 text-[11px] font-bold text-rajlo-red opacity-0 transition-opacity group-hover:opacity-100">
            Tap to open chat →
          </p>
        </div>
      </button>
    </div>
  );
}
