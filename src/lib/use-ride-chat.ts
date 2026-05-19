"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createSupabaseBrowserClient } from "./supabase-browser";

/**
 * Owns the live ride-chat data at the trip-page level so the icon can
 * show an unread count + a "you have a new message" toast WITHOUT the
 * chat sheet itself being open.
 *
 * Architecture:
 *   - The hook fetches the message history once when the ride id is
 *     known, then opens a Supabase Realtime subscription on the
 *     ride_messages table for instant incoming deliveries.
 *   - It tracks an `unreadCount` of peer-sent messages received since
 *     the last `markAllRead()`. The chat icon reads this; the trip
 *     page calls `markAllRead()` when the chat sheet opens.
 *   - `latestIncoming` carries the most recently arrived peer message
 *     so the trip page can pop a transient toast.
 *   - The chat sheet stops fetching its own messages — it accepts
 *     `messages` + `setMessages` as props and keeps doing the
 *     send / upload / record work locally.
 *
 * Two big perf wins vs. the old "chat sheet fetches on open" flow:
 *
 *   1. Messages are already in memory the moment the user taps the
 *      chat icon — no spinner, no re-mount cost.
 *   2. New messages append in place via the realtime payload; we no
 *      longer re-`GET` the entire thread on every push, which used to
 *      cost ~5KB + a round-trip on every keystroke from the peer.
 */

export type ChatMessage = {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: "rider" | "driver";
  kind: "text" | "image" | "voice";
  body: string;
  durationMs: number | null;
  readAt: string | null;
  createdAt: string;
};

export type UseRideChatResult = {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  loading: boolean;
  error: string | null;
  unreadCount: number;
  /** The latest peer-sent message since the last markAllRead — drives
   *  the new-message toast on the trip page. Null when no unread.   */
  latestIncoming: ChatMessage | null;
  markAllRead: () => void;
  refresh: () => Promise<void>;
};

type Options = {
  /** When false the hook stays idle (no fetch, no subscription). Used
   *  to skip initialisation while the rideId is still being resolved
   *  or when the trip page hasn't decided on a role yet.            */
  enabled?: boolean;
};

/**
 * Maps the snake_case row coming off Supabase Realtime into the
 * camelCase ChatMessage shape the rest of the app uses.
 */
type RawMessageRow = {
  id: string;
  ride_id: string;
  sender_id: string;
  sender_role: "rider" | "driver";
  kind: "text" | "image" | "voice";
  body: string;
  duration_ms: number | null;
  read_at: string | null;
  created_at: string;
};

function mapRow(row: RawMessageRow): ChatMessage {
  return {
    id: row.id,
    rideId: row.ride_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    kind: row.kind,
    body: row.body,
    durationMs: row.duration_ms,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function useRideChat(
  rideId: string | null,
  myRole: "rider" | "driver",
  options: Options = {},
): UseRideChatResult {
  const { enabled = true } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestIncoming, setLatestIncoming] = useState<ChatMessage | null>(
    null,
  );

  // We "anchor" the unread counter to the message that was newest at
  // the moment of the last markAllRead. Anything newer than this id
  // counts as unread. Using an id (vs. a timestamp) avoids clock-skew
  // edge cases between client and server.
  const lastSeenIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!rideId || !enabled) return;
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { messages: ChatMessage[] };
      setMessages(json.messages);
      setError(null);
      // First load: treat everything currently on the server as
      // already-read. Otherwise reopening the page mid-trip would
      // show "12 unread" forever.
      if (lastSeenIdRef.current === null && json.messages.length > 0) {
        lastSeenIdRef.current = json.messages[json.messages.length - 1].id;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    } finally {
      setLoading(false);
    }
  }, [rideId, enabled]);

  /* ─── Initial load ─── */
  useEffect(() => {
    if (!rideId || !enabled) return;
    setLoading(true);
    void refresh();
  }, [rideId, enabled, refresh]);

  /* ─── Realtime subscription ─── */
  useEffect(() => {
    if (!rideId || !enabled) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`ride-chat-${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ride_messages",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const incoming = mapRow(payload.new as RawMessageRow);
          if (incoming.kind === "text") {
            setMessages((prev) => {
              // Dedupe — own optimistic-sent messages will already be in
              // the list when their realtime echo arrives.
              if (prev.find((m) => m.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
          } else {
            // Image / voice messages arrive here with `body` set to the
            // raw Supabase Storage path — the realtime payload can't
            // carry the signed URL the API generates. Appending it
            // directly renders a broken <img> / dead <audio> on the
            // recipient's side. Re-fetch the thread so the GET endpoint
            // signs the media URLs. Text needs no signing, so it keeps
            // the cheap in-place append above.
            void refresh();
          }
          // Only peer messages count toward unread + toast — AND only
          // when they're not already read. A reconnect that re-fires
          // events for messages I've already seen shouldn't keep
          // popping the same notification.
          if (
            incoming.senderRole !== myRole &&
            incoming.readAt === null
          ) {
            setUnreadCount((c) => c + 1);
            setLatestIncoming(incoming);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rideId, myRole, enabled, refresh]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    setLatestIncoming(null);
    setMessages((prev) => {
      if (prev.length > 0) {
        lastSeenIdRef.current = prev[prev.length - 1].id;
      }
      return prev;
    });
  }, []);

  return {
    messages,
    setMessages,
    loading,
    error,
    unreadCount,
    latestIncoming,
    markAllRead,
    refresh,
  };
}
