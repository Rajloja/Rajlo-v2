"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./icons";
import { CallButton } from "./call-button";
import { Skeleton } from "./skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { compressImage, CHAT_COMPRESS } from "@/lib/compress-image";
import type { ChatMessage } from "@/lib/use-ride-chat";

/**
 * Real-time driver ↔ rider chat panel. Slides in from the right on
 * desktop, full-screen on mobile.
 *
 * - Loads message history on open
 * - Subscribes to Realtime postgres_changes on `ride_messages` for the
 *   given ride and re-fetches the list on every push (re-fetch beats
 *   parsing the raw row payload because the API signs media URLs that
 *   the realtime payload doesn't carry)
 * - Composer supports text, image attachments (camera or gallery),
 *   and voice notes recorded via the MediaRecorder API
 * - "Call" button is an in-app voice call via LiveKit (no PSTN, no
 *   phone-number exposure). Tapping it opens the LiveKit room scoped
 *   to this ride; the chat composer stays usable underneath.
 *
 * After the ride flips to a closed status (completed/cancelled),
 * server-side RLS stops returning messages to participants. The sheet
 * detects the flip via the `rideActive` prop and renders a "chat
 * archived" notice instead of the composer.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  rideId: string;
  myRole: "rider" | "driver";
  peerName: string;
  peerAvatarUrl?: string | null;
  /** When provided, the call icon turns into a real `tel:` link. */
  peerPhone?: string | null;
  /** False when the ride is in a terminal status. The composer is
   *  swapped for an "archived" banner. */
  rideActive: boolean;
  /** Owned by the parent via `useRideChat` — the chat sheet no longer
   *  fetches or subscribes itself. Sheet pushes optimistic messages
   *  back through `setMessages`; realtime echoes are deduped by id. */
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  loading: boolean;
  /** Called when the sheet opens so the parent can clear its unread
   *  badge / dismiss the new-message toast. */
  markAllRead?: () => void;
};

const RIDE_CHAT_BUCKET = "ride-chat";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_VOICE_BYTES = 16 * 1024 * 1024; // 16 MB

export function ChatSheet({
  open,
  onClose,
  rideId,
  myRole,
  peerName,
  peerAvatarUrl,
  peerPhone,
  rideActive,
  messages,
  setMessages,
  loading,
  markAllRead,
}: Props) {
  // myRole isn't read inside the sheet today (the chat row knows its
  // own sender_role), but it's part of the contract so callers can't
  // pass mismatched data. Reference it once to keep ESLint happy
  // without changing behaviour.
  void myRole;
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // (file input ref retired — `ImageSourceMenu` owns its own inputs
  //  so it can offer "Take photo" vs "Choose from library" cleanly.)
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ─── Voice recording state ─── */
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Body scroll lock when open on mobile ─── */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ─── Visual viewport tracking ───
   *
   * Mobile keyboards on iOS Safari (and even some Android browsers
   * before `interactive-widget=resizes-content`) overlay the layout
   * viewport without resizing it. That meant the chat panel's
   * `100dvh` height stayed equal to the full screen, so the composer
   * slid behind the keyboard the moment the rider tapped the input.
   *
   * The fix: ask the VisualViewport API for the actual visible
   * height and apply it inline on the panel. Whenever the keyboard
   * opens/closes, the panel snaps to fit the visible window and the
   * composer ends up sitting just above the keyboard. The
   * `100dvh` CSS fallback below covers browsers that don't support
   * VisualViewport (very old Safari, Firefox on Android < 79).
   */
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const vv =
      typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const apply = () => setViewportHeight(vv.height);
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [open]);

  /* ─── Mark messages read on open ─── */
  // Loading + subscribing is the parent's job (via `useRideChat`) so
  // the icon's unread badge updates regardless of whether this sheet
  // is mounted. All we do here is tell the parent "the user is now
  // looking at the chat" so the badge clears.
  useEffect(() => {
    if (!open) return;
    markAllRead?.();
  }, [open, markAllRead]);

  /* ─── Auto-scroll to bottom on new messages + keyboard resize ───
   *
   * Re-pinning to the bottom on `viewportHeight` change keeps the
   * latest message visible the moment the keyboard opens — without
   * this, the messages container shrinks but the scroll position
   * stays fixed, so the user sees old messages while typing.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, viewportHeight]);

  /* ─── Send text ─── */
  const sendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "text", body: text }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setDraft("");
      // Realtime will refresh, but optimistically append for snappier UX.
      // Dedup by id — if the realtime echo already landed, our optimistic
      // append would otherwise duplicate the bubble (the double-text bug).
      const json = (await res.json()) as { message: ChatMessage };
      setMessages((m) =>
        m.find((existing) => existing.id === json.message.id)
          ? m
          : [...m, json.message],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send message.");
    } finally {
      setSending(false);
    }
  };

  /* ─── Send image ─── */
  const sendImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image too large — keep it under 8 MB.");
      return;
    }
    await uploadAndPost(file, "image");
  };

  /* ─── Voice recording ─── */
  const startRecording = async () => {
    if (recording) return;
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;
      // We try Opus/WebM first (best size/quality on Chrome/Firefox/
      // Edge/Android Chrome), fall back to whatever the browser picks
      // (Safari uses MP4/AAC). The mime-type lands in the file
      // extension via the fallback to "audio/webm".
      const mimeCandidate = MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus",
      )
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mimeCandidate
        ? new MediaRecorder(stream, { mimeType: mimeCandidate })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      });
      recorder.start();
      recordStartRef.current = Date.now();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(
          Math.floor((Date.now() - recordStartRef.current) / 1000),
        );
      }, 250);
    } catch (e) {
      setRecordError(
        e instanceof Error
          ? "Microphone permission was blocked. Allow it in browser settings."
          : "Couldn't access microphone.",
      );
    }
  };

  const stopRecording = async (commit: boolean) => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (!recorder) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);

    // We need to wait for the final dataavailable + stop events so
    // chunksRef has the complete recording before we assemble.
    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });

    // Tear down the media stream so the OS-level recording indicator
    // disappears and we don't keep the mic warm.
    stream?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;

    if (!commit) {
      chunksRef.current = [];
      setRecordSeconds(0);
      return;
    }
    if (chunksRef.current.length === 0) return;

    const durationMs = Date.now() - recordStartRef.current;
    if (durationMs < 800) {
      setRecordError("Recording too short — hold longer.");
      chunksRef.current = [];
      setRecordSeconds(0);
      return;
    }
    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    setRecordSeconds(0);

    if (blob.size > MAX_VOICE_BYTES) {
      setRecordError("Voice note too large — keep it under 16 MB.");
      return;
    }
    const ext = mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";
    const file = new File([blob], `voice-${Date.now()}.${ext}`, {
      type: mimeType,
    });
    await uploadAndPost(file, "voice", durationMs);
  };

  /* ─── Shared upload + send for media kinds ─── */
  const uploadAndPost = async (
    file: File,
    kind: "image" | "voice",
    durationMs?: number,
  ) => {
    setSending(true);
    setError(null);

    // Optimistic message — shows the file in the chat immediately
    // with a rolling progress overlay so the user sees their image /
    // voice note "land" the moment they tap send, not after the
    // upload + POST round-trip. `id` is prefixed `optimistic-` so the
    // render path can spot it; replaced by the server's authoritative
    // message once the upload succeeds.
    const optimisticId = `optimistic-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const blobUrl = URL.createObjectURL(file);
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      rideId,
      senderId: "", // unknown until server confirms; render path doesn't care
      senderRole: myRole,
      kind,
      body: blobUrl,
      durationMs: durationMs ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticMessage]);

    try {
      const supabase = createSupabaseBrowserClient();
      // Compress photo attachments before upload (voice notes + other
      // non-images pass straight through). Keeps a shared trip photo
      // from re-downloading as a multi-MB original every time the
      // chat is reopened.
      const toUpload = await compressImage(file, CHAT_COMPRESS);
      // Path inside the bucket — lead with the ride_id folder so the
      // storage RLS policy can scope by foldername.
      const ext = toUpload.name.split(".").pop()?.toLowerCase() ?? "bin";
      const random = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${rideId}/${kind}-${random}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(RIDE_CHAT_BUCKET)
        .upload(path, toUpload, {
          contentType: toUpload.type,
          // One year, immutable — the path is randomised so the
          // content at this URL never changes.
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          body: path,
          durationMs: durationMs ?? null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { message: ChatMessage };
      // Swap the optimistic bubble for the server-confirmed one. If
      // the realtime echo for this message already landed (race),
      // just drop the optimistic placeholder rather than duplicating.
      setMessages((m) => {
        const alreadyHasReal = m.some((msg) => msg.id === json.message.id);
        if (alreadyHasReal) {
          return m.filter((msg) => msg.id !== optimisticId);
        }
        return m.map((msg) =>
          msg.id === optimisticId ? json.message : msg,
        );
      });
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Roll back the optimistic insertion + free the blob URL.
      setMessages((m) => m.filter((msg) => msg.id !== optimisticId));
      URL.revokeObjectURL(blobUrl);
      setError(
        e instanceof Error ? e.message : `Couldn't send ${kind}.`,
      );
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex">
      {/* Backdrop — dim layer behind the panel. Fades in. */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel — full-screen on mobile, right-edge sheet on desktop.
         The inline `height` style overrides the `h-[100dvh]` fallback
         when the VisualViewport API is available (every modern mobile
         browser). That's what keeps the composer above the keyboard
         instead of getting hidden underneath it. */}
      <div
        className="relative ml-auto flex h-[100dvh] w-full flex-col bg-surface shadow-2xl md:max-w-md"
        style={
          viewportHeight !== null ? { height: viewportHeight } : undefined
        }
      >
        {/* Header — sticky at the top of the flex column. flex-shrink-0
           prevents it from compressing when the messages area is
           crowded. */}
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-rajlo-black px-4 py-3 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-sm font-bold">
            {peerAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peerAvatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              peerName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold tracking-tight">
              {peerName}
            </p>
            <p className="truncate text-[11px] text-white/70">
              {rideActive
                ? "Active trip · End-to-end private to this ride"
                : "Trip ended · Chat archived"}
            </p>
          </div>
          {/* In-app voice call via LiveKit. PSTN numbers are never
             surfaced — the rider and driver are entirely insulated
             from each other's real phone number. */}
          {rideActive && <CallButton rideId={rideId} variant="subtle" label="" />}
        </header>

        {/* Message stream — the only scrollable region. `min-h-0` is
           critical: without it the flex item refuses to shrink below
           its intrinsic content size and would push the composer off
           the bottom of the panel. With it, this row absorbs whatever
           height is left over after the header + composer take theirs. */}
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto bg-surface-soft px-4 py-4"
        >
          {loading ? (
            // Stagger left/right bubbles to mirror real chat shape so
            // the layout doesn't jump when messages arrive.
            <div className="space-y-3">
              {[
                { side: "left", w: "w-2/3" },
                { side: "right", w: "w-1/2" },
                { side: "left", w: "w-1/2" },
                { side: "right", w: "w-3/4" },
                { side: "left", w: "w-1/3" },
              ].map((b, i) => (
                <div
                  key={i}
                  className={`flex ${b.side === "right" ? "justify-end" : "justify-start"}`}
                >
                  <Skeleton
                    className={`h-10 ${b.w} max-w-xs`}
                    rounded="2xl"
                  />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <span
                  aria-hidden
                  className="mx-auto block text-3xl leading-none"
                >
                  💬
                </span>
                <p className="mt-3 text-sm font-bold">
                  Send the first message
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted">
                  Coordinate pickup details, share a landmark, or ping
                  with a voice note. Stays private to this ride.
                </p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  mine={m.senderRole === myRole}
                />
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="shrink-0 border-t border-rajlo-red/20 bg-primary-soft px-4 py-2 text-xs font-semibold text-rajlo-red">
            {error}
          </div>
        )}

        {/* Composer / archived banner — sticky at the bottom of the
           flex column. `shrink-0` keeps it at full height even when
           the keyboard is up; `pb-[env(safe-area-inset-bottom)]`
           adds the iPhone home-indicator gap so the send button
           doesn't sit under the OS gesture bar. */}
        {rideActive ? (
          <footer className="shrink-0 border-t border-line bg-surface px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {recording ? (
              <RecordingBar
                seconds={recordSeconds}
                onCancel={() => stopRecording(false)}
                onSend={() => stopRecording(true)}
              />
            ) : (
              <div className="flex items-end gap-2">
                <ImageSourceMenu
                  disabled={sending}
                  onPickFromLibrary={(f) => void sendImage(f)}
                  onTakePhoto={(f) => void sendImage(f)}
                />
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void sendText();
                    }
                  }}
                  rows={1}
                  placeholder="Message…"
                  disabled={sending}
                  className="min-h-[40px] max-h-32 flex-1 resize-none rounded-2xl border border-line bg-surface-soft px-3 py-2 text-base outline-none focus:border-rajlo-red disabled:opacity-50"
                  style={{ fontSize: "16px" }}
                />
                {draft.trim() ? (
                  <button
                    type="button"
                    onClick={sendText}
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rajlo-red text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-50 active:translate-y-0"
                  >
                    {sending ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Icon name="arrow-right" className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sending}
                    aria-label="Record a voice note"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rajlo-red text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-50 active:translate-y-0"
                  >
                    <MicIcon />
                  </button>
                )}
              </div>
            )}
            {recordError && !recording && (
              <p className="mt-1.5 text-[11px] font-semibold text-rajlo-red">
                {recordError}
              </p>
            )}
            <p className="mt-1.5 text-[10px] text-muted">
              Messages stay visible only while the trip is active. After
              completion or cancellation, only Rajlo support can review
              this chat.
            </p>
          </footer>
        ) : (
          <footer className="shrink-0 border-t border-line bg-surface-soft px-4 py-4 text-center pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-sm font-bold">Chat archived</p>
            <p className="mt-1 text-xs text-muted">
              The trip has ended. For your safety, the conversation is
              now read-only and accessible only to Rajlo support.
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ─── Message bubble ─── */

function MessageBubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  // Optimistic messages (still uploading) carry a marker id and a
  // local blob URL as the body. We dim them slightly and overlay an
  // animated barber-pole progress bar so the user sees the upload is
  // in flight.
  const pending = m.id.startsWith("optimistic-");
  const time = new Date(m.createdAt).toLocaleTimeString("en-JM", {
    hour: "numeric",
    minute: "2-digit",
  });

  const align = mine ? "items-end self-end" : "items-start self-start";
  // Their-side bubble: themable surface (`bg-surface`) so it darkens
  // in dark mode instead of glaring bright white. My-side stays
  // brand-red — that's the brand colour and reads on both themes.
  const bubbleColor = mine
    ? "bg-rajlo-red text-white"
    : "bg-surface text-foreground border border-line";

  return (
    <li className={`flex max-w-[85%] flex-col ${align}`}>
      {m.kind === "text" && (
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${bubbleColor}`}
        >
          {m.body}
        </div>
      )}
      {m.kind === "image" && m.body && (
        <div
          className={`relative block overflow-hidden rounded-2xl ${
            mine ? "ring-2 ring-rajlo-red/30" : "border border-line"
          } ${pending ? "opacity-90" : ""}`}
        >
          {pending ? (
            // Local blob preview during upload — clicking shouldn't
            // open a new tab on a blob URL that may be revoked any
            // moment, so we render an <img> only.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.body}
              alt="Uploading photo"
              className="block max-h-72 w-full max-w-xs object-cover"
            />
          ) : (
            <a
              href={m.body}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.body}
                alt="Photo"
                className="block max-h-72 w-full max-w-xs object-cover"
              />
            </a>
          )}
          {pending && <PendingProgressBar />}
        </div>
      )}
      {m.kind === "voice" && m.body && (
        <div
          className={`relative flex items-center gap-2 rounded-2xl px-3 py-2 ${bubbleColor} ${pending ? "opacity-80" : ""}`}
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15">
            <MicIcon className="h-3.5 w-3.5" />
          </span>
          {pending ? (
            <span className="text-xs font-semibold">Sending voice note…</span>
          ) : (
            <audio
              controls
              src={m.body}
              className="h-9 max-w-[180px]"
              // `preload="auto"` is more aggressive than the previous
              // `metadata` value — some WebViews (Android) wouldn't
              // load the audio at all on metadata mode, so the controls
              // rendered but pressing play did nothing. `auto` makes
              // the WebView fetch the audio data up front so play
              // works on first tap.
              preload="auto"
              // iOS Safari + the iOS WebView won't autoplay or even
              // load buffered audio inline without playsInline.
              // Harmless on Android.
              playsInline
            />
          )}
          {m.durationMs !== null && (
            <span className="shrink-0 text-[11px] font-semibold opacity-80">
              {Math.max(1, Math.round(m.durationMs / 1000))}s
            </span>
          )}
          {pending && <PendingProgressBar />}
        </div>
      )}
      <p className="mt-1 px-1 text-[10px] text-muted">
        {time}
        {mine && m.readAt && " · Read"}
      </p>
    </li>
  );
}

/**
 * Indeterminate "rolling" progress bar shown overlaid on an in-flight
 * image / voice attachment. Supabase Storage doesn't expose upload
 * progress events, so this is purely visual — a sliding gradient that
 * loops every 1.2s. Disappears the moment the server-confirmed
 * message replaces the optimistic one.
 */
function PendingProgressBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-black/20">
      <div className="rajlo-pending-bar h-full w-1/3 bg-white/80" />
    </div>
  );
}

/* ─── Recording bar (replaces composer while a voice note is being captured) ─── */

function RecordingBar({
  seconds,
  onCancel,
  onSend,
}: {
  seconds: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-2 rounded-full border border-rajlo-red/30 bg-primary-soft px-3 py-1.5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-rajlo-red">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
      </span>
      <span className="flex-1 font-mono text-sm font-bold text-rajlo-red">
        {mm}:{ss}
      </span>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel recording"
        className="grid h-9 w-9 place-items-center rounded-full text-foreground hover:bg-surface"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSend}
        aria-label="Send voice note"
        className="grid h-9 w-9 place-items-center rounded-full bg-rajlo-red text-white shadow-md transition-transform hover:-translate-y-0.5"
      >
        <Icon name="arrow-right" className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── Image source menu — pick from library OR open the camera ─── */

function ImageSourceMenu({
  disabled,
  onPickFromLibrary,
  onTakePhoto,
}: {
  disabled?: boolean;
  onPickFromLibrary: (file: File) => void;
  onTakePhoto: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside tap.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="Send a photo"
        aria-expanded={open}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground hover:bg-surface-soft disabled:opacity-50"
      >
        <Icon name="upload" className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-10 w-44 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              cameraRef.current?.click();
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface-soft"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rajlo-red text-white">
              <CameraIcon />
            </span>
            Take photo
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              libraryRef.current?.click();
            }}
            className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm font-medium hover:bg-surface-soft"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-rajlo-red">
              <ImageIcon />
            </span>
            Choose photo
          </button>
        </div>
      )}

      {/* Hidden inputs — `capture="environment"` opens the rear
         camera directly (mobile); the libraryRef one opens the
         OS picker (Photos / Files). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onTakePhoto(f);
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPickFromLibrary(f);
        }}
      />
    </div>
  );
}

/* ─── Inline icons — kept local so we don't grow the shared icon set ─── */

function CameraIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ImageIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

/* ─── Mic icon — inline so we don't need to extend the icon set just for this ─── */

function MicIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
