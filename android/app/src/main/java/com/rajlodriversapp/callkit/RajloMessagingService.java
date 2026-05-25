package com.rajlodriversapp.callkit;

import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.util.Log;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Intercepts incoming FCM pushes BEFORE the Capacitor push plugin
 * sees them. For ordinary pushes (chat, trip update, ride request)
 * we delegate straight to Capacitor's MessagingService via super,
 * keeping every existing notification path intact.
 *
 * For pushes the server tags with `type = "incoming_call"` we skip
 * the Capacitor pipeline entirely and call
 * {@link TelecomManager#addNewIncomingCall(PhoneAccountHandle, Bundle)}
 * directly from this background context. That's the ONLY way to get
 * the native lockscreen incoming-call UI when the app is backgrounded
 * or killed — the WebView (and therefore the JS-driven call flow in
 * {@link RajloCallKit}) isn't running yet at that moment, and the
 * heads-up notification alone doesn't give us the system call UX.
 *
 * Wiring:
 *   - Server sends an FCM data-only message with `type=incoming_call`,
 *     `callId`, `callerName` (see src/lib/push.ts).
 *   - This service receives it via the standard MESSAGING_EVENT
 *     intent-filter we declare in AndroidManifest.xml.
 *   - We register the PhoneAccount (idempotent), then hand the call
 *     to Telecom. Telecom routes it to RajloConnectionService, which
 *     creates the RajloCallConnection that drives the lockscreen UI.
 *   - When the user accepts on the lockscreen, RajloCallConnection
 *     fires emitCallEvent("accepted") → JS picks it up via the
 *     RajloCallKit "callEvent" listener (once the WebView resumes)
 *     and runs the existing accept-call flow.
 */
public class RajloMessagingService extends MessagingService {

    private static final String TAG = "RajloMessagingService";
    private static final String CALL_TYPE = "incoming_call";
    /** Sent by the server when the CALLER hangs up while the call is
     *  still ringing on the callee side. Lets us dismiss the
     *  lockscreen ringer immediately even when the WebView is asleep
     *  and can't pick up the Realtime UPDATE in time. */
    private static final String CANCEL_TYPE = "call_cancelled";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");

        if (CALL_TYPE.equals(type)
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String callId = data.get("callId");
            String callerName = data.get("callerName");
            if (callId == null || callId.isEmpty()) {
                Log.w(TAG, "incoming_call push missing callId — falling back to default handling");
                super.onMessageReceived(remoteMessage);
                return;
            }
            try {
                announceIncomingCall(callId, callerName != null ? callerName : "Caller");
                // Don't forward to Capacitor — the Telecom UI is the
                // user-visible surface. Forwarding would also pop the
                // heads-up notification on top of the lockscreen UI,
                // doubling the cue.
                return;
            } catch (Exception e) {
                Log.e(TAG, "Failed to announce incoming call to Telecom; falling back to default push handling", e);
                // Fall through to default handling — the FCM heads-up
                // notification + in-app ringer (once the app wakes)
                // still get the user.
            }
        }

        if (CANCEL_TYPE.equals(type)) {
            String callId = data.get("callId");
            if (callId != null && !callId.isEmpty()) {
                Log.i(TAG, "call_cancelled push for " + callId + " — dismissing ringer");
                // closeCall finishes IncomingCallActivity (if showing)
                // AND tears down the Telecom Connection. No /decline
                // POST — the server already marked the row missed
                // server-side via the caller's /end call.
                RajloConnectionService.closeCall(callId);
            }
            // Don't forward to Capacitor — silent dismissal, no
            // user-facing notification.
            return;
        }

        super.onMessageReceived(remoteMessage);
    }

    /**
     * Register the self-managed PhoneAccount (idempotent) and tell
     * Telecom to draw the incoming-call UI. This is the same flow
     * the {@link RajloCallKit#addIncomingCall} JS bridge runs, just
     * triggered from FCM instead of from in-app JS — so it works
     * when the WebView isn't even alive yet.
     */
    private void announceIncomingCall(String callId, String callerName) {
        Context ctx = getApplicationContext();
        TelecomManager tm = (TelecomManager)
            ctx.getSystemService(Context.TELECOM_SERVICE);
        if (tm == null) {
            Log.w(TAG, "TelecomManager unavailable");
            return;
        }

        PhoneAccountHandle handle = new PhoneAccountHandle(
            new ComponentName(ctx, RajloConnectionService.class),
            "rajlo-voice"
        );

        // Register the account — safe to call repeatedly. Without
        // this the OS will reject addNewIncomingCall with no live
        // PhoneAccount.
        try {
            PhoneAccount account = PhoneAccount.builder(handle, "Rajlo")
                .setCapabilities(
                    PhoneAccount.CAPABILITY_SELF_MANAGED
                    | PhoneAccount.CAPABILITY_VIDEO_CALLING
                    | PhoneAccount.CAPABILITY_SUPPORTS_VIDEO_CALLING
                )
                .setShortDescription("Rajlo voice calls")
                .build();
            tm.registerPhoneAccount(account);
        } catch (Exception e) {
            Log.w(TAG, "PhoneAccount registration threw — assuming already registered", e);
        }

        // Defensive cleanup before announcing a new call — see the
        // matching call in RajloCallKit.addIncomingCall().
        RajloConnectionService.closeAll();

        Bundle clientExtras = new Bundle();
        clientExtras.putString(RajloCallKit.EXTRA_CALL_ID, callId);
        clientExtras.putString(RajloCallKit.EXTRA_CALLER_NAME, callerName);
        Bundle extras = new Bundle();
        extras.putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, clientExtras);

        tm.addNewIncomingCall(handle, extras);
        Log.i(TAG, "Telecom addNewIncomingCall fired for callId=" + callId);
    }
}
