"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import { Icon } from "./icons";
import { playConnectTone, playHangupTone, startRingbackTone } from "@/lib/call-sounds";
import { haptics } from "@/lib/native";
import { endCallNative } from "@/lib/native-call";

// If the callee never answers within this window, the caller side
// auto-hangs up. Mirrors the server-side 90s stale-call expiry but
// kicks in fast so the user gets prompt feedback instead of staring
// at a "calling…" screen indefinitely.
const NO_ANSWER_TIMEOUT_MS = 30_000;

/**
 * In-call audio sheet — modal bottom-sheet UI shown while a voice
 * call is connecting / in progress / wrapping up. Wraps LiveKit's
 * Room SDK (audio only: mute, hangup, minimize).
 *
 * Three states drive the UX:
 *
 *   - "connecting"  → token in hand, joining the LiveKit room. Spinner.
 *   - "ringing"     → connected + waiting for the other party to
 *                     accept. Shows "Calling…" + cancel button. We
 *                     learn the other side joined via the
 *                     ParticipantConnected event.
 *   - "in_call"     → both parties in the room. Show call duration,
 *                     mute toggle, minimize, hangup.
 *
 * Hangup calls /api/calls/[id]/end then disconnects from LiveKit.
 *
 * Minimize is a UX courtesy: the sheet shrinks to a sticky bar on
 * top of the page so the rider/driver can keep navigating during
 * a call (WhatsApp-style). The Room stays connected; audio keeps
 * flowing.
 */

export type InCallSheetProps = {
  callId: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  /** Name to show under the avatar — "Driver" / "Passenger" / actual
   *  name. */
  otherPartyName: string;
  /** When true, we're the caller and waiting for the other side to
   *  accept. Hides the "connected" state behind a "Ringing…" label
   *  until the second participant joins. */
  weAreCaller: boolean;
  /** Fires when the call ends from any side. Parent should close the
   *  sheet and stop showing the call UI. */
  onClose: () => void;
};

type Phase = "connecting" | "ringing" | "in_call" | "ended";

// Brief grace window between a remote-participant-leaving event and
// actually tearing down — covers normal network blips (driver in a
// tunnel, rider switching networks) without forcing a re-dial.
const REMOTE_GRACE_MS = 5000;

const log = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log("[in-call]", ...args);
};

export function InCallSheet({
  callId,
  roomName,
  token,
  livekitUrl,
  otherPartyName,
  weAreCaller,
  onClose,
}: InCallSheetProps) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsInCall, setSecondsInCall] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const acceptedAtRef = useRef<number | null>(null);
  const remoteGraceTimerRef = useRef<number | null>(null);
  // True once we've successfully made it past the initial connect and
  // into ringing / in_call. Used by the Disconnected handler to decide
  // whether a disconnect event is a "the call is over, close the sheet"
  // signal (call was actually in flight) or a "the call never connected"
  // signal (LiveKit rejected the token, room hadn't been provisioned,
  // network died during connect). In the latter case we keep the sheet
  // mounted with the error state so the caller can SEE what happened
  // instead of the sheet vanishing silently — that "flash and disappear"
  // is the exact failure the user has been reporting.
  const wasLiveRef = useRef(false);
  // Caller-side ringback tone — plays in a 2s-on/4s-off loop while
  // we're waiting for the callee to pick up. Lives in a ref so the
  // various lifecycle hooks (remote join, hangup, unmount) can stop
  // it without prop-drilling state.
  const stopRingbackRef = useRef<(() => void) | null>(null);
  // No-answer auto-hangup timer. Set when the caller side enters
  // the "ringing" phase, cleared as soon as the remote joins or
  // the call is cancelled.
  const noAnswerTimerRef = useRef<number | null>(null);

  // Connect to LiveKit on mount; disconnect on unmount.
  useEffect(() => {
    let cancelled = false;
    log("mounting", { roomName, weAreCaller, callId });
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    const clearGrace = () => {
      if (remoteGraceTimerRef.current != null) {
        window.clearTimeout(remoteGraceTimerRef.current);
        remoteGraceTimerRef.current = null;
      }
    };

    const onParticipantConnected = (
      p: { identity?: string; sid?: string } = {},
    ) => {
      log("remote participant connected", p.identity ?? p.sid ?? "?");
      clearGrace();
      if (room.remoteParticipants.size > 0) {
        const firstTimeAccepting = acceptedAtRef.current == null;
        if (firstTimeAccepting) {
          acceptedAtRef.current = Date.now();
          // "Tee-doo" connect tone — confirms the other side picked
          // up. Skipped on subsequent ParticipantConnected events
          // (LiveKit re-fires on reconnects).
          playConnectTone();
          void haptics.medium();
        }
        wasLiveRef.current = true;
        setPhase("in_call");
      }
    };

    const onParticipantDisconnected = (
      p: { identity?: string; sid?: string } = {},
    ) => {
      log("remote participant disconnected", p.identity ?? p.sid ?? "?");
      // Don't immediately tear down — give the remote a few seconds
      // to reconnect (network blip, app backgrounding, etc.). Only
      // close if they're still gone after the grace window.
      if (room.remoteParticipants.size === 0) {
        clearGrace();
        remoteGraceTimerRef.current = window.setTimeout(() => {
          log("remote did not reconnect — ending call");
          setPhase("ended");
          onClose();
        }, REMOTE_GRACE_MS);
      }
    };

    const onDisconnected = (reason?: unknown) => {
      log("room disconnected", reason);
      setPhase("ended");
      // Only tear the sheet down when the call was actually live at
      // some point (ringing on the caller side counts as live — we've
      // hit the LiveKit room successfully). Otherwise, this Disconnected
      // event is signalling a FAILED CONNECT — bad token, room not
      // provisioned, network blip during connect — and calling
      // onClose() here makes the sheet vanish silently. Keeping it
      // mounted lets the user actually see the "ended" state + the
      // error string, and dismiss it via the hangup button.
      if (wasLiveRef.current) {
        onClose();
      } else if (!error) {
        // Set a generic error so the "ended" state has something to
        // display instead of the fallback "Call ended" (which is what
        // the subtitle renders when `error` is null — misleading for
        // "we couldn't even connect" cases).
        setError(
          "We couldn't reach the call. Check your connection or try again.",
        );
      }
    };

    const onReconnecting = () => log("room reconnecting…");
    const onReconnected = () => log("room reconnected");
    const onConnectionStateChanged = (state: unknown) =>
      log("connection state →", state);
    const onMediaDevicesError = (err: unknown) => {
      log("media devices error", err);
      setError(
        "Mic access blocked. Allow microphone permission to talk.",
      );
    };

    // ─── Remote audio attach ───
    // Standard LiveKit pattern: when a remote track is subscribed,
    // attach() returns a wired-up <audio> element that we drop into
    // the DOM so the browser plays it. We track attached elements
    // in a Map so we can clean them up on unmount or
    // TrackUnsubscribed.
    const attachedAudio = new Map<string, HTMLAudioElement[]>();
    const attachRemoteAudio = (track: RemoteTrack | Track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const sid = (track as { sid?: string }).sid ?? Math.random().toString();
      if (attachedAudio.has(sid)) {
        log("already attached audio for sid", sid);
        return;
      }
      // attach() may return a new element OR re-use an existing one.
      // We just append whatever it gives us and let the browser play.
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      // Force volume to max — some browsers ramp this down silently.
      el.volume = 1.0;
      document.body.appendChild(el);
      attachedAudio.set(sid, [el]);
      log("attached remote audio", {
        sid,
        muted: el.muted,
        volume: el.volume,
        paused: el.paused,
      });
      // Some browsers refuse to autoplay even with the user
      // gesture; try to nudge play() and log if it fails.
      el.play().catch((err) =>
        log("audio play() rejected — gesture-gated?", err),
      );
    };
    const detachRemoteAudio = (track: RemoteTrack | Track) => {
      const sid = (track as { sid?: string }).sid;
      if (!sid) return;
      const elements = attachedAudio.get(sid);
      if (!elements) return;
      track.detach().forEach((el) => el.remove());
      elements.forEach((el) => el.remove());
      attachedAudio.delete(sid);
      log("detached remote audio", sid);
    };

    const onTrackSubscribed = (
      track: RemoteTrack,
      pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      log("track subscribed", {
        kind: track.kind,
        sid: pub.trackSid,
        participant: participant.identity,
      });
      attachRemoteAudio(track);
    };
    const onTrackUnsubscribed = (
      track: RemoteTrack,
      pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      log("track unsubscribed", {
        sid: pub.trackSid,
        participant: participant.identity,
      });
      detachRemoteAudio(track);
    };
    const onTrackPublished = (
      pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      log("remote published a track", {
        sid: pub.trackSid,
        kind: pub.kind,
        participant: participant.identity,
        subscribed: pub.isSubscribed,
      });
    };
    const onLocalTrackPublished = (
      pub: LocalTrackPublication,
    ) => {
      log("LOCAL track published", {
        sid: pub.trackSid,
        kind: pub.kind,
        muted: pub.isMuted,
      });
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.TrackPublished, onTrackPublished);
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);

    (async () => {
      try {
        log("connecting to livekit", livekitUrl);
        await room.connect(livekitUrl, token);
        if (cancelled) {
          log("cancelled before connect completed; tearing down");
          await room.disconnect();
          return;
        }
        log("connected; remoteParticipants on join =", room.remoteParticipants.size);
        // Enable mic via the canonical API. We catch the result so a
        // permission denial logs explicitly instead of throwing.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (micErr) {
          log("setMicrophoneEnabled threw", micErr);
          setError(
            "Couldn't access your microphone. Allow mic permission in your browser settings.",
          );
        }
        const pub = Array.from(
          room.localParticipant.audioTrackPublications.values(),
        )[0];
        if (pub?.track) {
          localTrackRef.current = pub.track as LocalAudioTrack;
          log("local audio track published", {
            sid: pub.trackSid,
            muted: pub.isMuted,
            source: pub.source,
          });
        } else {
          log(
            "WARN: no local audio publication after setMicrophoneEnabled",
            {
              audioPubsCount: room.localParticipant.audioTrackPublications.size,
              trackPubsCount: room.localParticipant.trackPublications.size,
            },
          );
        }
        // Manually subscribe to + attach every track on every remote
        // participant already in the room. The TrackSubscribed event
        // covers FUTURE subscriptions; this catches the ones that
        // were subscribed during room.connect() before our handler
        // was attached.
        for (const p of room.remoteParticipants.values()) {
          log("existing remote participant", p.identity, {
            audioPubs: p.audioTrackPublications.size,
            trackPubs: p.trackPublications.size,
          });
          for (const remotePub of p.audioTrackPublications.values()) {
            log("existing audio pub", {
              sid: remotePub.trackSid,
              subscribed: remotePub.isSubscribed,
              hasTrack: !!remotePub.track,
            });
            if (remotePub.track) {
              attachRemoteAudio(remotePub.track);
            }
          }
        }
        // We hit the LiveKit room. Anything after this point is
        // "live" — a subsequent Disconnected is a real end-of-call
        // and should tear the sheet down normally.
        wasLiveRef.current = true;
        if (room.remoteParticipants.size > 0) {
          acceptedAtRef.current = Date.now();
          setPhase("in_call");
        } else if (weAreCaller) {
          setPhase("ringing");
        } else {
          setPhase("in_call");
        }
      } catch (err) {
        log("connect failed", err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't connect to the call.",
          );
          setPhase("ended");
        }
      }
    })();

    return () => {
      cancelled = true;
      log("unmounting; disconnecting room");
      clearGrace();
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected, onReconnected);
      room.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.TrackPublished, onTrackPublished);
      room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
      // Detach any audio elements we appended.
      for (const els of attachedAudio.values()) els.forEach((el) => el.remove());
      void room.disconnect();
    };
  }, [livekitUrl, token, onClose, weAreCaller, callId, roomName]);

  // Live call duration counter — runs while in_call.
  useEffect(() => {
    if (phase !== "in_call") return;
    const start = acceptedAtRef.current ?? Date.now();
    const interval = setInterval(() => {
      setSecondsInCall(Math.max(0, Math.round((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Caller-side ringback + no-answer timeout.
  //
  // While the caller is waiting for the callee to pick up, we play
  // the classic 2s-on/4s-off ringback tone (so they hear "the call
  // is ringing on the other end" — without this the UI just shows
  // "Calling…" silently which feels broken).
  //
  // We also set a 30s no-answer ceiling. If the callee never joins
  // the LiveKit room in that window, we hang up locally and the row
  // gets marked as missed via the /end endpoint. Without this cap,
  // a caller can sit indefinitely listening to ringback while the
  // callee never sees the call (rare push delivery failure, callee
  // offline, etc.).
  useEffect(() => {
    if (phase !== "ringing" || !weAreCaller) return;
    stopRingbackRef.current = startRingbackTone();
    noAnswerTimerRef.current = window.setTimeout(() => {
      log("no answer after 30s — auto-cancelling");
      // Fire-and-forget /end. Server treats a "ringing" call closed
      // by the caller as missed (not "ended" which implies a real
      // conversation happened).
      void fetch(`/api/calls/${callId}/end`, { method: "POST" }).catch(
        () => null,
      );
      void endCallNative(callId);
      setPhase("ended");
      onClose();
    }, NO_ANSWER_TIMEOUT_MS);
    return () => {
      stopRingbackRef.current?.();
      stopRingbackRef.current = null;
      if (noAnswerTimerRef.current != null) {
        window.clearTimeout(noAnswerTimerRef.current);
        noAnswerTimerRef.current = null;
      }
    };
  }, [phase, weAreCaller, callId, onClose]);

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
    log(next ? "muted" : "unmuted");
  };

  const hangup = async () => {
    log("hangup tapped");
    // Play the "doo-dat" hangup tone + a short haptic so the user
    // gets immediate confirmation the call is ending — the network
    // round-trip to /end can take 100-300ms and feels unresponsive
    // without it.
    playHangupTone();
    void haptics.medium();
    // Tear down the OS-level Telecom call so the system call UI / log
    // doesn't show "ongoing" after the user has hung up from inside
    // the app. No-op on web / pre-O Android.
    void endCallNative(callId);
    try {
      await fetch(`/api/calls/${callId}/end`, { method: "POST" });
    } catch {
      /* swallow — closing anyway */
    }
    setPhase("ended");
    onClose();
  };

  const mm = Math.floor(secondsInCall / 60)
    .toString()
    .padStart(2, "0");
  const ss = (secondsInCall % 60).toString().padStart(2, "0");
  const subtitle =
    phase === "connecting"
      ? "Connecting…"
      : phase === "ringing"
        ? "Ringing…"
        : phase === "in_call"
          ? `In call · ${mm}:${ss}`
          : (error ?? "Call ended");

  // ─── Minimized: sticky banner on top of the page ───
  // Compact WhatsApp-style top bar so the rider/driver can keep
  // navigating mid-call. Tap to restore the full sheet. Audio stays
  // flowing because the Room object is kept alive in the ref.
  //
  // Position:
  //   - `fixed` so it never scrolls with page content.
  //   - On mobile, sits 68px from the viewport top so it clears the
  //     portal's 60px-tall mobile header (sticky `py-3` + h-9 buttons)
  //     with an 8px breathing gap. Previously `top-3` parked it
  //     inside the navbar's vertical band even though z-100 put it on
  //     top, which read as the pill being "under" the navbar.
  //   - Desktop has no top navbar (sidebar layout) so a small `top-3`
  //     gap is enough.
  //   - z-[100] keeps it above the navbar (z-40), the mobile drawer
  //     backdrop (z-55), and the drawer panel (z-60).
  if (minimized && phase !== "ended") {
    return (
      <div className="fixed inset-x-0 top-[68px] z-[100] mx-auto flex max-w-md justify-center px-4 md:top-3">
        <div className="flex w-full items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-2xl ring-1 ring-white/20">
          {/* Restore — clicking the body (not the hangup button)
             expands back to the full sheet. */}
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:bg-white/5 rounded-xl -mx-2 px-2 py-1"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15">
              <Icon name="phone" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{otherPartyName}</p>
              <p className="text-[11px] text-white/80">{subtitle}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void hangup()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rajlo-red transition-transform hover:scale-105"
            title="End call"
          >
            <Icon name="phone-off" className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-rajlo-black/50 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-2xl md:rounded-3xl">
        {/* Minimize handle — tap or pull down to collapse */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            disabled={phase === "ended"}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-soft text-foreground transition-colors hover:bg-line disabled:opacity-50"
            title="Minimize"
          >
            <Icon name="chevron-down" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4">
          {/* Avatar circle — initial placeholder */}
          <div className="grid h-24 w-24 place-items-center rounded-full bg-primary-soft text-3xl font-extrabold text-rajlo-red">
            {otherPartyName.charAt(0).toUpperCase()}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tracking-tight">{otherPartyName}</p>
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
          </div>

          <div className="mt-2 flex w-full items-center justify-center gap-4">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase !== "in_call"}
              aria-pressed={muted}
              className={`grid h-14 w-14 place-items-center rounded-full transition-colors ${
                muted
                  ? "bg-rajlo-red text-white"
                  : "bg-surface-soft text-foreground hover:bg-line"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              title={muted ? "Unmute" : "Mute"}
            >
              <Icon
                name={muted ? "mic-off" : "mic"}
                className="h-6 w-6"
              />
            </button>
            <button
              type="button"
              onClick={hangup}
              className="grid h-16 w-16 place-items-center rounded-full bg-rajlo-red text-white shadow-lg shadow-rajlo-red/30 transition-transform hover:scale-105"
              title="End call"
            >
              <Icon name="phone-off" className="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
