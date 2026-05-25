package com.rajlodriversapp.callkit;

import android.util.Log;
import android.webkit.CookieManager;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Tiny native HTTP helper for fire-and-forget call-lifecycle endpoints
 * (/api/calls/[id]/decline so far).
 *
 * Why we have this:
 *   When the user taps Decline on the native lockscreen UI, the
 *   WebView is typically suspended or even killed. Relying on the
 *   JS-side listener to forward the decline to the server would
 *   leave the caller ringing for up to 90 seconds (server-side
 *   stale-call expiry). Posting from native — using the auth
 *   cookies already stored in the WebView's CookieManager — cuts
 *   the rider immediately.
 *
 * Auth:
 *   Reads cookies from `android.webkit.CookieManager` for the
 *   driver.rajlo.com origin and forwards them as a Cookie header.
 *   Supabase's session cookie is set httpOnly but Android's
 *   CookieManager still exposes it to native code (the httpOnly
 *   flag only applies to JS access inside a browser context).
 */
final class CallApi {

    private static final String TAG = "CallApi";
    /** Base URL of the live Rajlo deployment. Mirrors the
     *  server.url in capacitor.config.ts; bump here too if it
     *  ever changes. */
    private static final String BASE_URL = "https://driver.rajlo.com";

    private CallApi() {}

    /**
     * Fire-and-forget POST to /api/calls/{id}/decline. Runs on a
     * background thread so the caller (typically IncomingCallActivity)
     * doesn't block the UI / Activity lifecycle.
     */
    static void postDecline(String callId) {
        if (callId == null || callId.isEmpty()) return;
        new Thread(() -> {
            try {
                postCallAction("decline", callId);
            } catch (Exception e) {
                Log.w(TAG, "decline POST failed", e);
            }
        }, "CallApi-decline").start();
    }

    /**
     * Fire-and-forget POST to /api/calls/{id}/end. Used when a call
     * is in progress and the user hangs up via the native call UI
     * (Bluetooth headset hook, system control center, etc.) but the
     * WebView isn't running to handle the JS-side hangup.
     */
    static void postEnd(String callId) {
        if (callId == null || callId.isEmpty()) return;
        new Thread(() -> {
            try {
                postCallAction("end", callId);
            } catch (Exception e) {
                Log.w(TAG, "end POST failed", e);
            }
        }, "CallApi-end").start();
    }

    private static void postCallAction(String action, String callId)
        throws IOException {
        URL url = new URL(BASE_URL + "/api/calls/" + callId + "/" + action);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setDoOutput(false);
            // Server doesn't strictly need a body for these endpoints
            // (they only need the user/auth context + the callId
            // from the path), but it expects POST + content-type.
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");

            String cookies = CookieManager.getInstance().getCookie(BASE_URL);
            if (cookies != null && !cookies.isEmpty()) {
                conn.setRequestProperty("Cookie", cookies);
            } else {
                Log.w(TAG, "no cookies for " + BASE_URL + " — request will 401");
            }

            int code = conn.getResponseCode();
            Log.i(TAG, action + " " + callId + " → " + code);
        } finally {
            conn.disconnect();
        }
    }
}
