package com.rajlodriversapp.callkit;

import android.content.ComponentName;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

/**
 * Bridge between the Rajlo web UI and Android's Telecom framework.
 *
 * Three methods JS calls into:
 *
 *   • register()         — one-time PhoneAccount registration. Must
 *                          succeed before any incoming-call hand-off.
 *
 *   • addIncomingCall()  — tell Telecom an inbound voice call is
 *                          ringing. OS shows the lockscreen UI / call
 *                          banner / fires the system ringtone.
 *
 *   • endCall()          — tear down the system call UI (remote hung
 *                          up while JS was already in the room).
 *
 * Three events the plugin emits back to JS:
 *
 *   • call:accepted  — user tapped Accept on the system UI / Bluetooth.
 *   • call:declined  — user tapped Decline on the system UI.
 *   • call:ended     — user tapped Hang Up on the system UI.
 *
 * The JS side listens for these to drive the LiveKit hand-off (accept
 * → join room; declined/ended → run the existing hangup path).
 */
@CapacitorPlugin(name = "RajloCallKit")
public class RajloCallKit extends Plugin {

    /** Tag the Telecom service passes through `request.getExtras()`
     *  so the connection knows which Rajlo call row it represents. */
    public static final String EXTRA_CALL_ID = "rajlo.call_id";
    public static final String EXTRA_CALLER_NAME = "rajlo.caller_name";

    /** Singleton instance reference — Telecom callbacks fire from a
     *  static context (the OS owns the Connection object) so the
     *  static `emitCallEvent` helper needs a way back to the live
     *  plugin instance to call notifyListeners. */
    private static WeakReference<RajloCallKit> instanceRef;

    @Override
    public void load() {
        instanceRef = new WeakReference<>(this);
    }

    /* ─────────────────── JS → Native methods ─────────────────── */

    @PluginMethod
    public void register(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Telecom self-managed APIs require Android 8+");
            return;
        }
        try {
            TelecomManager tm = (TelecomManager)
                getContext().getSystemService(android.content.Context.TELECOM_SERVICE);
            if (tm == null) {
                call.reject("TelecomManager unavailable");
                return;
            }
            PhoneAccountHandle handle = handle();
            PhoneAccount account = PhoneAccount.builder(handle, "Rajlo")
                .setCapabilities(
                    PhoneAccount.CAPABILITY_SELF_MANAGED
                    | PhoneAccount.CAPABILITY_VIDEO_CALLING
                    | PhoneAccount.CAPABILITY_SUPPORTS_VIDEO_CALLING
                )
                .setShortDescription("Rajlo voice calls")
                .build();
            tm.registerPhoneAccount(account);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to register PhoneAccount", e);
        }
    }

    @PluginMethod
    public void addIncomingCall(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Telecom self-managed APIs require Android 8+");
            return;
        }
        String callId = call.getString("callId");
        String callerName = call.getString("callerName", "Caller");
        if (callId == null || callId.isEmpty()) {
            call.reject("callId is required");
            return;
        }
        try {
            TelecomManager tm = (TelecomManager)
                getContext().getSystemService(android.content.Context.TELECOM_SERVICE);
            if (tm == null) {
                call.reject("TelecomManager unavailable");
                return;
            }
            // Defensive cleanup — kill any leftover self-managed calls
            // from a previous session. Without this, a stale RINGING
            // call (e.g. from a process crash mid-accept) blocks the
            // OS from accepting our new addNewIncomingCall with a
            // CREATE_CONNECTION_FAILED / WAITING_CALL event.
            RajloConnectionService.closeAll();
            // Bundle the call metadata so the Connection can read it
            // when the OS instantiates it.
            Bundle clientExtras = new Bundle();
            clientExtras.putString(EXTRA_CALL_ID, callId);
            clientExtras.putString(EXTRA_CALLER_NAME, callerName);
            Bundle extras = new Bundle();
            extras.putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, clientExtras);
            extras.putParcelable(
                TelecomManager.EXTRA_INCOMING_CALL_ADDRESS,
                Uri.fromParts("rajlo", callerName, null)
            );
            tm.addNewIncomingCall(handle(), extras);
            call.resolve();
        } catch (SecurityException se) {
            // Most common cause: MANAGE_OWN_CALLS permission denied,
            // or the user has disabled the PhoneAccount in Settings.
            call.reject(
                "Telecom rejected addNewIncomingCall — check that the "
                + "Rajlo phone account is enabled in system Settings",
                se
            );
        } catch (Exception e) {
            call.reject("addNewIncomingCall failed", e);
        }
    }

    @PluginMethod
    public void endCall(PluginCall call) {
        String callId = call.getString("callId");
        if (callId == null || callId.isEmpty()) {
            call.reject("callId is required");
            return;
        }
        boolean closed = RajloConnectionService.closeCall(callId);
        JSObject result = new JSObject();
        result.put("closed", closed);
        call.resolve(result);
    }

    /* ─────────────────── Native → JS events ─────────────────── */

    /** Called from the Connection lifecycle hooks. Bridges back to
     *  the JS listener via Capacitor's notifyListeners. Static so the
     *  Connection (created by the OS) can reach it without holding
     *  a live plugin reference. */
    static void emitCallEvent(String action, String callId) {
        RajloCallKit plugin = instanceRef != null ? instanceRef.get() : null;
        if (plugin == null) return;
        // Clean up our registry on terminal states.
        if ("declined".equals(action) || "ended".equals(action)) {
            RajloConnectionService.unregister(callId);
        }
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("callId", callId);
        // retainUntilConsumed=true keeps the event queued until the JS
        // listener attaches. Required because the user might accept
        // the call on the lockscreen BEFORE the WebView has even
        // resumed — without retention, the "accepted" event would
        // fire into a void and the in-call sheet would never mount.
        plugin.notifyListeners("callEvent", data, true);
    }

    /* ─────────────────── Helpers ─────────────────── */

    private PhoneAccountHandle handle() {
        ComponentName cn = new ComponentName(
            getContext(),
            RajloConnectionService.class
        );
        return new PhoneAccountHandle(cn, "rajlo-voice");
    }
}
