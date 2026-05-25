import "server-only";

import { AccessToken } from "livekit-server-sdk";

/**
 * Server-side LiveKit helpers — token generation + room naming.
 *
 * The browser SDK uses these tokens to connect to a LiveKit room.
 * Tokens are signed JWTs scoped to a specific (room, identity, grant
 * set) tuple, so a rider's token only lets them join THEIR ride's
 * room — never anyone else's.
 *
 * Required env (read at runtime — never bundled to the client):
 *   LIVEKIT_URL         — wss://your-project.livekit.cloud
 *   LIVEKIT_API_KEY     — from LiveKit Cloud project settings
 *   LIVEKIT_API_SECRET  — from LiveKit Cloud project settings
 *
 * NEXT_PUBLIC_LIVEKIT_URL is also read by the client to know which
 * server to connect to. Same URL value as the server-side one, just
 * exposed to the bundle.
 */

function requireEnv() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      "LiveKit not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and " +
        "LIVEKIT_API_SECRET in your environment.",
    );
  }
  return { url, apiKey, apiSecret };
}

export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
  );
}

/**
 * Deterministic room name from a trip's primary key + the
 * call's started_at timestamp. Each new call between the same two
 * parties gets a fresh room — easier debugging in LiveKit's dashboard
 * than re-using a single room across calls.
 *
 * Format: `trip-{kind}-{tripId}-{epochMs}`
 *   kind ∈ ride | hail | journey
 */
export function buildRoomName(
  kind: "ride" | "hail" | "journey",
  tripId: string,
  startedAtMs: number = Date.now(),
): string {
  return `trip-${kind}-${tripId}-${startedAtMs}`;
}

/**
 * Generate a LiveKit access token for a specific user joining a
 * specific room. The token authorises:
 *   - publish + subscribe of audio (voice call)
 *   - room-join on the named room ONLY
 *   - identity = user's auth.users.id (so the other party can
 *     resolve who they're talking to without sending phone numbers)
 *
 * Display name comes from the profile / driver row; we pass it
 * through so the LiveKit dashboard + the in-call UI can label the
 * participant clearly.
 *
 * 1-hour TTL — calls are short, and if a re-connect lands after the
 * TTL the rider/driver just rejoins via /api/calls/token.
 */
export async function mintCallToken(args: {
  roomName: string;
  identity: string;
  displayName: string;
}): Promise<string> {
  const { url: _url, apiKey, apiSecret } = requireEnv();
  void _url;
  const at = new AccessToken(apiKey, apiSecret, {
    identity: args.identity,
    name: args.displayName,
    ttl: 60 * 60, // 1 hour
  });
  at.addGrant({
    room: args.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // for future text/DTMF over the same channel
  });
  return await at.toJwt();
}

export function livekitWsUrl(): string {
  const { url } = requireEnv();
  return url;
}
