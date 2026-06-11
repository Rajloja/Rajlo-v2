"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native";

/**
 * Native-call helpers wrapping the Capacitor plugins. All functions
 * are no-ops on web — only the Capacitor WebView ever hits the real
 * APIs. Lazy-imports the plugins so the web bundle stays lean.
 *
 *   • showIncomingCallNotification — fires a heads-up notification
 *     with Accept/Decline action buttons. Used as a backup to the
 *     in-app full-screen ringer for the case where the app is in
 *     the background and the WebView is paused.
 *
 *   • clearIncomingCallNotification — dismisses the notification
 *     once the user accepts/declines from inside the app, so the
 *     OS notification tray doesn't show a stale "ringing" item.
 *
 *   • acquireScreenWake / releaseScreenWake — keep the screen
 *     awake while in a call so a 30-min call doesn't lock the
 *     device every 30 seconds.
 */

const NOTIFICATION_ID = 99001;

export async function showIncomingCallNotification(args: {
  callId: string;
  callerName: string;
  callerRole: "rider" | "driver";
}): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import(
      "@capacitor/local-notifications"
    );
    // Ensure we have permission first. The driver app's onboarding
    // already requests notifications for trip alerts, but be defensive.
    const perms = await LocalNotifications.requestPermissions();
    if (perms.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: `Incoming call · ${args.callerName}`,
          body:
            args.callerRole === "rider"
              ? "Your passenger is calling"
              : "Your driver is calling",
          sound: "default",
          // Heads-up priority on Android so it slides down from the
          // top even with the app open. iOS treats this as a
          // standard banner — true full-screen lockscreen UI is
          // a CallKit-only feature.
          channelId: "rajlo-calls",
          ongoing: false,
          autoCancel: true,
          extra: { callId: args.callId, type: "incoming_call" },
        },
      ],
    });
  } catch {
    /* plugin missing / permission denied — silent fallback to the
       in-app ringer */
  }
}

export async function clearIncomingCallNotification(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import(
      "@capacitor/local-notifications"
    );
    await LocalNotifications.cancel({
      notifications: [{ id: NOTIFICATION_ID }],
    });
  } catch {
    /* silent */
  }
}

/**
 * One-time channel registration for the call notifications. Android
 * needs the channel to exist before any notification on it shows
 * heads-up. iOS ignores channels — no-op there.
 */
export async function registerCallNotificationChannel(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import(
      "@capacitor/local-notifications"
    );
    // Channels API exists on Android; createChannel is idempotent
    // (re-registering is fine).
    if (
      "createChannel" in LocalNotifications &&
      typeof (LocalNotifications as { createChannel?: unknown })
        .createChannel === "function"
    ) {
      await (
        LocalNotifications as unknown as {
          createChannel: (opts: {
            id: string;
            name: string;
            importance: number;
            visibility?: number;
            vibration?: boolean;
            sound?: string;
          }) => Promise<void>;
        }
      ).createChannel({
        id: "rajlo-calls",
        name: "Rajlo voice calls",
        // 5 = MAX importance (heads-up banner + sound + vibrate)
        importance: 5,
        visibility: 1, // VISIBILITY_PUBLIC — show on lockscreen
        vibration: true,
        sound: "default",
      });
    }
  } catch {
    /* silent */
  }
}

/* ─── Android Telecom integration (RajloCallKit plugin) ─── */

/**
 * Native RajloCallKit bridge — see
 * `android/app/src/main/java/com/rajlodriversapp/callkit/`.
 *
 * What it gives us that local notifications + in-app sheet don't:
 *   • Real lockscreen incoming-call UI (the OS draws it, not us),
 *     so the call rings through even with the WebView paused.
 *   • Bluetooth headset hook button answers/hangs up the call.
 *   • Appears in the system call log + recent calls list.
 *   • Audio routing (earpiece / speaker / Bluetooth) handled by the
 *     OS rather than the WebView audio element.
 *
 * Three operations:
 *   • registerNativeCallKit()       — register the Rajlo PhoneAccount.
 *                                     Idempotent. Must be called once
 *                                     per app launch BEFORE any
 *                                     incoming call is announced.
 *   • addIncomingCallNative({...})  — tell the OS an inbound call is
 *                                     ringing. The OS handles the UI.
 *   • endCallNative(callId)         — programmatic teardown (remote
 *                                     side hung up, OS UI still open).
 *
 * Plus `addNativeCallEventListener(fn)` for the OS → JS callbacks
 * (`accepted` / `declined` / `ended`). The IncomingCallToast wires
 * this up to the existing accept / decline / end flow.
 */

type CallKitPlugin = {
  register: () => Promise<void>;
  addIncomingCall: (opts: {
    callId: string;
    callerName: string;
  }) => Promise<void>;
  endCall: (opts: { callId: string }) => Promise<{ closed: boolean }>;
  addListener: (
    eventName: string,
    cb: (data: { action: string; callId: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

// Plugin proxy resolved lazily on first use — we cache it in a
// module-level slot so the JS proxy is built exactly once.
//
// IMPORTANT: this function MUST be synchronous. Returning the
// plugin proxy from an `async` function (or wrapping it in a
// Promise) causes Promise resolution to call `proxy.then(...)` —
// and Capacitor's proxy intercepts every property access, including
// `then`, so it would try to invoke a native `then()` method on
// RajloCallKit. That fails with "RajloCallKit.then() is not
// implemented on android". Static import of `registerPlugin` from
// `@capacitor/core` keeps everything sync.
let _callKitProxy: CallKitPlugin | null | undefined;

function getCallKit(): CallKitPlugin | null {
  if (_callKitProxy !== undefined) return _callKitProxy;
  if (!isNativeApp()) {
    _callKitProxy = null;
    return null;
  }
  try {
    // registerPlugin is idempotent for a natively-registered name —
    // it returns the existing proxy (with a benign console warning).
    // We rely on it rather than `Capacitor.Plugins.RajloCallKit`
    // because the latter isn't guaranteed to be populated by the
    // time this is first called.
    _callKitProxy = registerPlugin<CallKitPlugin>("RajloCallKit");
    return _callKitProxy;
  } catch {
    _callKitProxy = null;
    return null;
  }
}

let _callKitRegistered = false;

export async function registerNativeCallKit(): Promise<void> {
  if (_callKitRegistered) return;
  const plugin = getCallKit();
  if (!plugin) return;
  try {
    await plugin.register();
    _callKitRegistered = true;
  } catch (err) {
    // Most common cause: pre-O Android. Silent fallback — the
    // in-app ringer + heads-up notification still work.
    console.warn("[native-call] CallKit register failed:", err);
  }
}

export async function addIncomingCallNative(args: {
  callId: string;
  callerName: string;
}): Promise<boolean> {
  const plugin = getCallKit();
  if (!plugin) return false;
  // Lazy register on first use — guards against the boot wiring
  // not running for some reason (deep-link cold start, etc).
  await registerNativeCallKit();
  try {
    await plugin.addIncomingCall({
      callId: args.callId,
      callerName: args.callerName,
    });
    return true;
  } catch (err) {
    console.warn("[native-call] addIncomingCall failed:", err);
    return false;
  }
}

export async function endCallNative(callId: string): Promise<void> {
  const plugin = getCallKit();
  if (!plugin) return;
  try {
    await plugin.endCall({ callId });
  } catch {
    /* call already gone — fine */
  }
}

/**
 * Subscribe to `accepted` / `declined` / `ended` / `held` / `unheld`
 * events from the system call UI. Returns an unsubscribe function.
 */
export async function addNativeCallEventListener(
  handler: (event: { action: string; callId: string }) => void,
): Promise<() => void> {
  const plugin = getCallKit();
  if (!plugin) return () => {};
  try {
    const sub = await plugin.addListener("callEvent", handler);
    return () => {
      void sub.remove?.();
    };
  } catch {
    return () => {};
  }
}

/* ─── Screen wake-lock (ref-counted) ───
 *
 * Multiple parts of the driver app legitimately need to keep the
 * screen + WebView JS thread alive at once: an active LiveKit call,
 * an active ride mid-trip, possibly an SOS flow. Each owns its own
 * tag and we hold the lock for as long as ANY owner still has it.
 *
 * Without this, the active-trip provider would call `keepAwake()`,
 * a call would also call `keepAwake()`, and then the FIRST one to
 * end would `allowSleep()` and break the other. Ref-counting fixes
 * that.
 *
 * Why we need this at all on the driver side:
 *   Android pauses the WebView's JS thread when the screen is off
 *   even though the @capacitor-community/background-geolocation
 *   foreground service keeps GPS firing natively. That means the
 *   plugin's onFix callback fires natively but can't reach our
 *   Supabase broadcast — the rider's car appears frozen even
 *   though the driver is moving. Holding the screen-wake lock
 *   keeps the WebView (and therefore the JS broadcast loop) active
 *   for the entire trip. Battery cost is acceptable — the phone is
 *   the driver's tool, plugged in or on a dashboard mount almost
 *   always anyway.
 */

const _wakeOwners = new Set<string>();

/** Acquire the screen-wake lock under the given owner tag. Calling
 *  with the same tag twice is a no-op. The lock is held until every
 *  owner that acquired it has released it.
 *
 *  `tag` defaults to `"default"` so existing call sites that didn't
 *  pass a tag keep behaving like they always did. */
export async function acquireScreenWake(
  tag: string = "default",
): Promise<void> {
  if (!isNativeApp()) return;
  const wasEmpty = _wakeOwners.size === 0;
  _wakeOwners.add(tag);
  if (!wasEmpty) return;
  try {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    await KeepAwake.keepAwake();
  } catch {
    /* silent */
  }
}

/** Release the screen-wake lock for the given owner tag. The lock
 *  is only allowed-to-sleep when EVERY owner has released. */
export async function releaseScreenWake(
  tag: string = "default",
): Promise<void> {
  if (!isNativeApp()) return;
  if (!_wakeOwners.delete(tag)) return;
  if (_wakeOwners.size > 0) return;
  try {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    await KeepAwake.allowSleep();
  } catch {
    /* silent */
  }
}
