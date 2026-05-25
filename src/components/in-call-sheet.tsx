"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type LocalAudioTrack } from "livekit-client";
import { Icon } from "./icons";

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
        if (acceptedAtRef.current == null) {
          acceptedAtRef.current = Date.now();
        }
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
      onClose();
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

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);

    (async () => {
      try {
        log("connecting to livekit", livekitUrl);
        await room.connect(livekitUrl, token);
        if (cancelled) {
          log("cancelled before connect completed; tearing down");
          await room.disconnect();
          return;
        }
        log("connected; enabling mic");
        await room.localParticipant.setMicrophoneEnabled(true);
        const pub = Array.from(
          room.localParticipant.audioTrackPublications.values(),
        )[0];
        if (pub?.track) {
          localTrackRef.current = pub.track as LocalAudioTrack;
        }
        log(
          "mic enabled; remoteParticipants =",
          room.remoteParticipants.size,
        );
        if (room.remoteParticipants.size > 0) {
          acceptedAtRef.current = Date.now();
          setPhase("in_call");
        } else if (weAreCaller) {
          setPhase("ringing");
        } else {
          // Callee joined — caller may already have left if we hit a
          // race, but assume they're there. Caller's
          // ParticipantConnected will tell us if they show up later.
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

  // Auto-attach remote audio tracks to hidden <audio> elements.
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const attached = new Map<string, HTMLAudioElement>();
    const attach = (track: Track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const audio = track.attach() as HTMLAudioElement;
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      document.body.appendChild(audio);
      attached.set(track.sid ?? Math.random().toString(), audio);
      log("attached remote audio", track.sid);
    };
    const detach = (track: Track) => {
      track.detach().forEach((el) => el.remove());
    };

    const onTrackSubscribed = (track: Track) => attach(track);
    const onTrackUnsubscribed = (track: Track) => detach(track);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        if (pub.track) attach(pub.track);
      }
    }

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      for (const el of attached.values()) el.remove();
    };
  }, []);

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
  if (minimized && phase !== "ended") {
    return (
      <div className="fixed inset-x-0 top-3 z-[100] mx-auto flex max-w-md justify-center px-4">
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
