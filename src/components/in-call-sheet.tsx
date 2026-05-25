"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type LocalAudioTrack } from "livekit-client";
import { Icon } from "./icons";

/**
 * In-call audio sheet — modal bottom-sheet UI shown while a voice
 * call is connecting / in progress / wrapping up. Wraps LiveKit's
 * Room SDK (no UI lib needed since we only do audio: mute, hangup,
 * connection-state indicator).
 *
 * Three states drive the UX:
 *
 *   - "connecting"  → token in hand, joining the LiveKit room. Spinner.
 *   - "ringing"     → connected + waiting for the other party to
 *                     accept. Shows "Calling…" + cancel button. We
 *                     learn the other side joined via the
 *                     ParticipantConnected event.
 *   - "in_call"     → both parties in the room. Show call duration,
 *                     mute toggle, speaker toggle, hangup.
 *
 * Hangup calls /api/calls/[id]/end then disconnects from LiveKit.
 * Parent component closes the sheet when status becomes terminal
 * (ended | missed | declined) — typically via the Realtime
 * subscription on the `calls` row.
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
  const [error, setError] = useState<string | null>(null);
  const [secondsInCall, setSecondsInCall] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const acceptedAtRef = useRef<number | null>(null);

  // Connect to LiveKit on mount; disconnect on unmount.
  useEffect(() => {
    let cancelled = false;
    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      // Voice-only call — explicitly opt OUT of capturing video so we
      // never trip the camera-permission prompt.
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    const onParticipantConnected = () => {
      // Someone else joined → call is live. If we were ringing, flip
      // to in_call. If we were the callee already connected with our
      // caller present, this is a no-op.
      if (room.remoteParticipants.size > 0) {
        if (acceptedAtRef.current == null) {
          acceptedAtRef.current = Date.now();
        }
        setPhase("in_call");
      }
    };
    const onParticipantDisconnected = () => {
      // Other side hung up → we end too. Server-side /end handler
      // updates the DB; we just need to close locally.
      if (room.remoteParticipants.size === 0) {
        setPhase("ended");
        onClose();
      }
    };
    const onDisconnected = () => {
      setPhase("ended");
      onClose();
    };

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    (async () => {
      try {
        await room.connect(livekitUrl, token);
        if (cancelled) return;
        // Publish the local mic.
        await room.localParticipant.setMicrophoneEnabled(true);
        const pub = Array.from(room.localParticipant.audioTrackPublications.values())[0];
        if (pub?.track) {
          localTrackRef.current = pub.track as LocalAudioTrack;
        }
        // If the other party is already in the room we go straight
        // to in_call; otherwise we're ringing (caller waiting for
        // accept) or already in_call (callee after accept handshake).
        if (room.remoteParticipants.size > 0) {
          acceptedAtRef.current = Date.now();
          setPhase("in_call");
        } else if (weAreCaller) {
          setPhase("ringing");
        } else {
          setPhase("in_call");
        }
      } catch (err) {
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
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      void room.disconnect();
    };
  }, [livekitUrl, token, onClose, weAreCaller]);

  // Live call duration counter — runs while in_call.
  useEffect(() => {
    if (phase !== "in_call") return;
    const start = acceptedAtRef.current ?? Date.now();
    const interval = setInterval(() => {
      setSecondsInCall(Math.max(0, Math.round((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Audio elements for remote tracks. We auto-attach each remote
  // audio track to a hidden <audio> so it plays through the device
  // speaker. (LiveKit's React components do this for us, but we're
  // keeping the DOM minimal so a small useEffect is simpler.)
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const attached = new Map<string, HTMLAudioElement>();
    const attach = (track: Track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const audio = track.attach() as HTMLAudioElement;
      audio.autoplay = true;
      // `playsInline` only exists on HTMLVideoElement in the typings,
      // but in practice browsers honour it on <audio> too — set via
      // attribute so TS doesn't complain.
      audio.setAttribute("playsinline", "true");
      document.body.appendChild(audio);
      attached.set(track.sid ?? Math.random().toString(), audio);
    };
    const detach = (track: Track) => {
      track.detach().forEach((el) => el.remove());
    };

    const onTrackSubscribed = (track: Track) => attach(track);
    const onTrackUnsubscribed = (track: Track) => detach(track);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    // Attach anything already subscribed by the time the listener runs.
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
  };

  const hangup = async () => {
    // Fire-and-forget the server hangup; the Realtime sub on `calls`
    // tells the other side. Disconnect locally regardless.
    try {
      await fetch(`/api/calls/${callId}/end`, { method: "POST" });
    } catch {
      /* swallow — we're closing anyway */
    }
    setPhase("ended");
    onClose();
  };

  const mm = Math.floor(secondsInCall / 60)
    .toString()
    .padStart(2, "0");
  const ss = (secondsInCall % 60).toString().padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-rajlo-black/50 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-2xl md:rounded-3xl">
        <div className="flex flex-col items-center gap-4">
          {/* Avatar circle — initial placeholder; in-call only */}
          <div className="grid h-24 w-24 place-items-center rounded-full bg-primary-soft text-3xl font-extrabold text-rajlo-red">
            {otherPartyName.charAt(0).toUpperCase()}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tracking-tight">{otherPartyName}</p>
            <p className="mt-1 text-xs text-muted">
              {phase === "connecting" && "Connecting…"}
              {phase === "ringing" && "Ringing…"}
              {phase === "in_call" && `In call · ${mm}:${ss}`}
              {phase === "ended" && (error ?? "Call ended")}
            </p>
          </div>

          {/* Action buttons */}
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
