import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "./supabase-server";
import { getFirebaseAdmin } from "./firebase-admin";

/**
 * Server-side web push delivery.
 *
 * Reads VAPID config from env at request time. Without it set, every
 * `pushTo*` helper short-circuits as `{ ok:false, skipped:true }` so
 * dev keeps working without VAPID keys.
 *
 * Env vars (set in `.env.local`, see scripts/generate-vapid.mjs to
 * generate fresh keys):
 *   VAPID_PUBLIC_KEY      — base64url public key (also exposed via
 *                           NEXT_PUBLIC_VAPID_PUBLIC_KEY for the
 *                           browser to use as applicationServerKey)
 *   VAPID_PRIVATE_KEY     — base64url private key (server only!)
 *   VAPID_SUBJECT         — `mailto:` URL for push providers to
 *                           reach out if anything's wrong with
 *                           our deliveries (default ops@rajlo.com)
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Deep-link target opened on click. Defaults to "/". */
  url?: string;
  /** Tag for dedup — newer push with the same tag replaces older. */
  tag?: string;
  /** Re-buzz even if a same-tag notification is already showing. */
  renotify?: boolean;
  /** Hero image inside the notification (Android, Chrome). */
  image?: string;
  /** Small icon (192x192). Defaults to brand mark. */
  icon?: string;
  /** Monochrome silhouette for Android tray. Defaults to brand mark. */
  badge?: string;
  /** Up to 2 buttons. Each `action` value is sent on click. */
  actions?: Array<{ action: string; title: string }>;
  /** Keeps the notification on screen until dismissed (Chrome desktop). */
  requireInteraction?: boolean;
  /** Vibration pattern (Android). */
  vibrate?: number[];
  /** Arbitrary payload routed back via the `notificationclick` event. */
  data?: Record<string, unknown>;
  /** Send the FCM message as data-only (no `notification` field). FCM's
   *  default behavior with a `notification` field is to auto-display the
   *  push in the system tray and SKIP onMessageReceived when the app is
   *  backgrounded — which kills our ability to intercept the push and
   *  call TelecomManager. Setting this true forces FCM to deliver the
   *  payload as data, which always invokes onMessageReceived so our
   *  RajloMessagingService can drive the native call UI directly.
   *  Web-push is unaffected (it always uses the data payload anyway). */
  androidDataOnly?: boolean;
};

type SendResult =
  | { ok: true; sent: number; pruned: number }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:ops@rajlo.com",
    pub,
    priv,
  );
  configured = true;
  return true;
}

/**
 * Send a push to every subscription for the given user. Best-effort —
 * failed sub-ids get pruned automatically (404/410 from the push
 * service means the subscription is dead).
 *
 * Caller passes a Supabase service-role client. We never trust an auth
 * client here because deletion of dead subs needs to bypass RLS.
 */
export async function pushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<SendResult> {
  // Fan out to both delivery channels in parallel. Web-push covers
  // browser PWAs; FCM covers the Capacitor driver app on Android.
  // The two channels share the same payload shape so callers don't
  // care which devices the user has.
  const [webResult, nativeResult] = await Promise.all([
    sendWebPushBatch(supabase, userId, payload),
    sendNativeFcmBatch(supabase, userId, payload),
  ]);
  return {
    ok: true,
    sent: webResult.sent + nativeResult.sent,
    pruned: webResult.pruned + nativeResult.pruned,
  };
}

/** Internal — sends to all `platform='web'` rows for the user using
 *  the web-push protocol. Identical to the previous pushToUser body,
 *  just factored so we can fan out web + native in parallel. */
async function sendWebPushBatch(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) {
    return { sent: 0, pruned: 0 };
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("platform", "web");

  if (error || !subs || subs.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  const body = JSON.stringify(serialize(payload));
  let sent = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh ?? "", auth: s.auth ?? "" },
          },
          body,
        );
        sent += 1;
      } catch (err) {
        // 404 (NotFound) or 410 (Gone) means the subscription is dead.
        // Prune it so we don't keep retrying on every event.
        const status =
          (err as { statusCode?: number } | null)?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          deadIds.push(s.id);
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }

  if (sent > 0) {
    const aliveIds = subs.map((s) => s.id).filter((id) => !deadIds.includes(id));
    if (aliveIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString() })
        .in("id", aliveIds);
    }
  }

  return { sent, pruned: deadIds.length };
}

/**
 * Internal — sends to all `platform='android'`/`'ios'` rows for the
 * user via Firebase Cloud Messaging using `firebase-admin`. Mirrors
 * the dead-token pruning of the web-push path (FCM returns
 * `messaging/registration-token-not-registered` for stale tokens).
 *
 * Returns `{ sent: 0, pruned: 0 }` silently if Firebase Admin isn't
 * configured — dev environments stay quiet.
 */
async function sendNativeFcmBatch(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  const app = await getFirebaseAdmin();
  if (!app) return { sent: 0, pruned: 0 };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, native_token, platform")
    .eq("user_id", userId)
    .in("platform", ["android", "ios"]);

  if (!subs || subs.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  const { getMessaging } = await import("firebase-admin/messaging");
  const messaging = getMessaging(app);

  let sent = 0;
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const token = s.native_token as string | null;
      if (!token) return;
      try {
        // The notification payload (title/body) is what Android renders
        // as a system notification when the app is backgrounded. The
        // data payload is forwarded to the app for in-app handling
        // (e.g., deep-linking to a chat thread).
        //
        // For payloads marked `androidDataOnly`, we skip the notification
        // field entirely. That forces FCM to invoke our service's
        // onMessageReceived even when the app is backgrounded — without
        // this, FCM auto-displays a tray notification and silently skips
        // our handler, killing the native call UI path.
        const fcmData = buildFcmData(payload);
        // Also include title/body inside data so the native service can
        // render its own fallback notification if Telecom rejects the
        // call (e.g. on devices that disable self-managed accounts).
        if (payload.androidDataOnly) {
          fcmData.title = payload.title;
          fcmData.body = payload.body;
        }
        await messaging.send({
          token,
          ...(payload.androidDataOnly
            ? {}
            : {
                notification: {
                  title: payload.title,
                  body: payload.body,
                },
              }),
          data: fcmData,
          android: {
            // `high` so FCM wakes the device from doze for ride
            // requests + safety alerts — both time-sensitive.
            priority: "high",
            ...(payload.androidDataOnly
              ? {}
              : {
                  notification: {
                    // Target the high-importance `rajlo_alerts` channel
                    // created client-side at app start. Without referencing
                    // this channel explicitly the notification falls back
                    // to Android's default which has IMPORTANCE_DEFAULT
                    // (no heads-up banner). The channel ID is mirrored
                    // in src/lib/native.ts so keep them in sync.
                    channelId: "rajlo_alerts",
                    tag: payload.tag,
                  },
                }),
          },
        });
        sent += 1;
      } catch (err) {
        // FCM marks tokens dead with these codes; prune to avoid
        // retrying on every event.
        const code = (err as { code?: string } | null)?.code ?? "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          deadIds.push(s.id as string);
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }

  if (sent > 0) {
    const aliveIds = subs
      .map((s) => s.id as string)
      .filter((id) => !deadIds.includes(id));
    if (aliveIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString() })
        .in("id", aliveIds);
    }
  }

  return { sent, pruned: deadIds.length };
}

/** Flattens the PushPayload's url/data/etc. into string values that
 *  FCM accepts (FCM data payloads are strict: keys + values must be
 *  strings, no nested objects). */
function buildFcmData(p: PushPayload): Record<string, string> {
  const data: Record<string, string> = {};
  if (p.url) data.url = p.url;
  if (p.tag) data.tag = p.tag;
  if (p.data) {
    for (const [key, value] of Object.entries(p.data)) {
      data[key] =
        typeof value === "string" ? value : JSON.stringify(value);
    }
  }
  return data;
}

/**
 * Convenience wrapper — uses the service-role client itself so callers
 * who already have one can pass it, but if they don't we make one.
 */
export async function pushToUserById(
  userId: string,
  payload: PushPayload,
): Promise<SendResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      skipped: true,
      reason: "Service role not configured",
    };
  }
  return pushToUser(supabase, userId, payload);
}

/** Filter the payload to the keys the service worker expects, dropping
 *  anything undefined so the wire payload stays small. */
function serialize(p: PushPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: p.title,
    body: p.body,
  };
  if (p.url) out.url = p.url;
  if (p.tag) out.tag = p.tag;
  if (p.renotify) out.renotify = true;
  if (p.image) out.image = p.image;
  if (p.icon) out.icon = p.icon;
  if (p.badge) out.badge = p.badge;
  if (p.actions && p.actions.length > 0) out.actions = p.actions;
  if (p.requireInteraction) out.requireInteraction = true;
  if (p.vibrate) out.vibrate = p.vibrate;
  if (p.data) out.data = p.data;
  return out;
}

/** Public VAPID key for browser-side `applicationServerKey`. Returns
 *  null if not configured — callers should bail gracefully. */
export function getPublicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
