package com.rajlodriversapp.callkit;

import android.os.Build;
import android.os.Bundle;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import java.util.HashMap;
import java.util.Map;

/**
 * Bridges Android Telecom → Rajlo voice calls.
 *
 * When the OS receives a `TelecomManager.addNewIncomingCall(...)`
 * request from {@link RajloCallKit}, it routes it to this service,
 * which creates a {@link RajloCallConnection} the OS uses to drive
 * the lockscreen ringer / system call UI.
 *
 * For outgoing calls (rider/driver-initiated) we'd implement
 * onCreateOutgoingConnection too. We currently always initiate
 * the call from the JS side first (so the OS doesn't need to know
 * about it until the row is created), but the hook is here for
 * symmetry / future use.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class RajloConnectionService extends ConnectionService {

    /** Registry of active connections by callId. Lets the plugin
     *  `endCall(callId)` look up the right connection to destroy
     *  when the OTHER party hangs up — without this, the native
     *  call UI would stay on screen after a remote hangup. */
    private static final Map<String, RajloCallConnection> active =
        new HashMap<>();

    static void register(RajloCallConnection conn) {
        active.put(conn.getCallId(), conn);
    }

    static void unregister(String callId) {
        active.remove(callId);
    }

    /** Tear down a specific call from outside the Telecom framework.
     *  Used by the plugin when JS reports the remote side hung up
     *  (Realtime UPDATE on the calls row). */
    public static boolean closeCall(String callId) {
        RajloCallConnection conn = active.remove(callId);
        if (conn == null) return false;
        conn.closeFromRemote();
        return true;
    }

    @Override
    public Connection onCreateIncomingConnection(
        PhoneAccountHandle connectionManagerPhoneAccount,
        @NonNull ConnectionRequest request
    ) {
        Bundle extras = request.getExtras();
        String callId = null;
        String callerName = null;
        if (extras != null) {
            Bundle clientExtras = extras.getBundle(
                TelecomManager.EXTRA_INCOMING_CALL_EXTRAS
            );
            if (clientExtras != null) {
                callId = clientExtras.getString(RajloCallKit.EXTRA_CALL_ID);
                callerName = clientExtras.getString(
                    RajloCallKit.EXTRA_CALLER_NAME
                );
            }
        }
        if (callId == null) callId = "unknown";

        RajloCallConnection conn = new RajloCallConnection(callId);
        conn.setRinging();
        if (callerName != null) {
            conn.setCallerDisplayName(
                callerName,
                android.telecom.TelecomManager.PRESENTATION_ALLOWED
            );
        }
        register(conn);
        return conn;
    }

    @Override
    public void onCreateIncomingConnectionFailed(
        PhoneAccountHandle connectionManagerPhoneAccount,
        ConnectionRequest request
    ) {
        // OS rejected our addNewIncomingCall — usually because the
        // PhoneAccount isn't registered or the user disabled it.
        // We get notified so we can clean up our registry; the JS
        // side will time out on the lack of a "ringing" state and
        // fall back to the in-app full-screen ringer.
        Bundle extras = request != null ? request.getExtras() : null;
        if (extras != null) {
            Bundle clientExtras = extras.getBundle(
                TelecomManager.EXTRA_INCOMING_CALL_EXTRAS
            );
            if (clientExtras != null) {
                String callId = clientExtras.getString(
                    RajloCallKit.EXTRA_CALL_ID
                );
                if (callId != null) unregister(callId);
            }
        }
    }

    @Override
    public Connection onCreateOutgoingConnection(
        PhoneAccountHandle connectionManagerPhoneAccount,
        ConnectionRequest request
    ) {
        // Outbound calls are JS-driven today — but we still need to
        // return a Connection so the OS doesn't crash. Mark it active
        // immediately since the LiveKit room is already set up by the
        // time JS reaches here.
        Bundle extras = request.getExtras();
        String callId = extras != null
            ? extras.getString(RajloCallKit.EXTRA_CALL_ID, "outgoing")
            : "outgoing";
        RajloCallConnection conn = new RajloCallConnection(callId);
        conn.setDialing();
        register(conn);
        return conn;
    }
}
