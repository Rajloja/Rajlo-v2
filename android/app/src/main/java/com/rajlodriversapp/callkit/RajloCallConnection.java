package com.rajlodriversapp.callkit;

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

    public RajloCallConnection(String callId) {
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

    /* ─────────────────── Outgoing-call lifecycle ─────────────────── */

    @Override
    public void onShowIncomingCallUi() {
        // The Telecom framework calls this when the system is ready
        // to show the incoming-call UI. For self-managed connections
        // we must explicitly accept — the OS won't auto-route to a
        // lockscreen activity unless we provide one.
        // We leave the OS-default UI here; future work could swap in
        // a custom full-screen Activity.
        super.onShowIncomingCallUi();
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
