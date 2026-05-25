package com.rajlodriversapp.callkit;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.telecom.Connection;
import android.telecom.DisconnectCause;

import androidx.annotation.RequiresApi;

/**
 * A single Rajlo voice call as the Android Telecom framework sees it.
 *
 * The OS holds this object as the "phone call" — the lockscreen
 * incoming-call UI, the bluetooth-headset hook key, the audio routing
 * (earpiece vs speaker vs Bluetooth), and the call list in the dialer
 * all flow through here. We do nothing fancy in the connection itself:
 * the actual audio runs over LiveKit inside the WebView. This object
 * exists purely so Android treats the call as native.
 *
 * Lifecycle events (answer / reject / disconnect) bubble back to JS
 * through {@link RajloCallKit#emitCallEvent}, which lets the React
 * layer hand off to the LiveKit room or hang up symmetrically.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class RajloCallConnection extends Connection {

    /** The Rajlo `calls.id` UUID. Used by the JS layer to match the
     *  native event back to the call row. */
    private final String callId;

    /** Context used to launch IncomingCallActivity. Set by the
     *  ConnectionService when it constructs us — Connection itself
     *  is not a Context. */
    private final Context appContext;

    /** Caller display name, captured at construction so we can pass
     *  it to IncomingCallActivity even though the OS won't surface
     *  the original ConnectionRequest to onShowIncomingCallUi. */
    private String callerName = "Caller";

    public RajloCallConnection(Context context, String callId) {
        this.appContext = context != null
            ? context.getApplicationContext()
            : null;
        this.callId = callId;
        // Self-managed audio — we hand the actual mic / speaker to
        // LiveKit, NOT the Telecom AudioManager. PROPERTY_SELF_MANAGED
        // tells Telecom "we own the audio, don't switch routes".
        setConnectionProperties(PROPERTY_SELF_MANAGED);
        // CAPABILITY_HOLD enables the pause/resume controls in the
        // system call UI — gives us the standard phone-app feel.
        setConnectionCapabilities(CAPABILITY_HOLD | CAPABILITY_SUPPORT_HOLD);
        // Audio mode is voice (not video/RTT). Required for the
        // earpiece/speaker toggle in the system call UI.
        setAudioModeIsVoip(true);
    }

    public String getCallId() {
        return callId;
    }

    void setCallerName(String name) {
        if (name != null && !name.isEmpty()) this.callerName = name;
    }

    public String getCallerName() {
        return callerName;
    }

    /* ─────────────────── Outgoing-call lifecycle ─────────────────── */

    @Override
    public void onShowIncomingCallUi() {
        // Self-managed connections get NO system call UI. Telecom
        // creates the Connection in RINGING state but the OS never
        // shows anything — it expects us to draw our own.
        //
        // We launch IncomingCallActivity, which:
        //   - bypasses the lockscreen / wakes the screen
        //   - draws Accept / Decline buttons
        //   - plays the system ringtone + vibrates
        //
        // Without this hook the user sees absolutely nothing on the
        // device when an FCM-driven call arrives — exactly the bug
        // we hit on Samsung One UI.
        if (appContext != null) {
            Intent intent = new Intent(appContext, IncomingCallActivity.class);
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_NO_HISTORY
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            );
            intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId);
            intent.putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, callerName);
            appContext.startActivity(intent);
        }
        super.onShowIncomingCallUi();
    }

    /* ─────────────────── UI-button callbacks ─────────────────── */

    /** Called from IncomingCallActivity when the user taps Accept. */
    void acceptFromUi() {
        onAnswer();
    }

    /** Called from IncomingCallActivity when the user taps Decline. */
    void declineFromUi() {
        onReject();
    }

    /* ─────────────────── User-action callbacks ─────────────────── */

    @Override
    public void onAnswer() {
        // User tapped Accept on the system call UI / Bluetooth pickup.
        setActive();
        RajloCallKit.emitCallEvent("accepted", callId);
    }

    @Override
    public void onReject() {
        // User tapped Decline on the system call UI.
        setDisconnected(new DisconnectCause(DisconnectCause.REJECTED));
        destroy();
        RajloCallKit.emitCallEvent("declined", callId);
    }

    @Override
    public void onDisconnect() {
        // User tapped Hang Up on the system call UI.
        setDisconnected(new DisconnectCause(DisconnectCause.LOCAL));
        destroy();
        RajloCallKit.emitCallEvent("ended", callId);
    }

    @Override
    public void onHold() {
        // User tapped Hold. LiveKit doesn't natively support pause,
        // but flipping STATE_HOLDING gives the UI the visual cue and
        // we can mute the local mic on the JS side.
        setOnHold();
        RajloCallKit.emitCallEvent("held", callId);
    }

    @Override
    public void onUnhold() {
        setActive();
        RajloCallKit.emitCallEvent("unheld", callId);
    }

    @Override
    public void onAbort() {
        // The OS aborted the call for system reasons (e.g. a real
        // phone call took priority). Treat like a hangup.
        setDisconnected(new DisconnectCause(DisconnectCause.OTHER));
        destroy();
        RajloCallKit.emitCallEvent("ended", callId);
    }

    /* ─────────────────── Programmatic close ─────────────────── */

    /** Called from JS / plugin when the OTHER side hangs up. Tears
     *  down the native call UI without firing another "ended" event
     *  back to JS (JS already knows — it's what told us to close). */
    public void closeFromRemote() {
        setDisconnected(new DisconnectCause(DisconnectCause.REMOTE));
        destroy();
    }
}
