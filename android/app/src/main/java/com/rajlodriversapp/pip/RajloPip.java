package com.rajlodriversapp.pip;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.rajlodriversapp.MainActivity;

import java.lang.ref.WeakReference;

/**
 * Bridge for Picture-in-Picture on the driver app.
 *
 * JS → native:
 *   • setNavActive(active) — flag whether the driver is in immersive
 *     turn-by-turn nav. Read by MainActivity.onUserLeaveHint to decide
 *     whether to drop into PiP when the app is backgrounded.
 *
 * native → JS:
 *   • pipModeChanged { isInPip } — fired when the activity enters/exits
 *     PiP (from MainActivity.onPictureInPictureModeChanged). The web UI
 *     listens and swaps the full nav screen for a compact directions-
 *     only layout while floating, so the tiny window shows the next
 *     maneuver + distance instead of the whole cropped screen.
 */
@CapacitorPlugin(name = "RajloPip")
public class RajloPip extends Plugin {

    /** True while the driver is in immersive turn-by-turn navigation. */
    public static volatile boolean navActive = false;

    /** Live instance handle so the static PiP-mode emitter (called from
     *  the Activity's lifecycle callback, not a JS call) can reach
     *  notifyListeners. */
    private static WeakReference<RajloPip> instanceRef;

    @Override
    public void load() {
        instanceRef = new WeakReference<>(this);
    }

    /** JS → native: flip the nav-active flag. Called on every
     *  enter/exit of the immersive nav on the driver active-trip page. */
    @PluginMethod
    public void setNavActive(PluginCall call) {
        navActive = Boolean.TRUE.equals(call.getBoolean("active", false));
        // Arm/disarm OS auto-enter PiP on the UI thread (API 31+). This
        // is the reliable path on modern Android — the manual
        // enterPictureInPictureMode() fallback (API 26-30) lives in
        // MainActivity.onUserLeaveHint.
        final boolean active = navActive;
        final Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            activity.runOnUiThread(
                () -> ((MainActivity) activity).setNavPipEnabled(active)
            );
        }
        call.resolve();
    }

    /** JS → native: enter PiP right now (from a user gesture, while the
     *  app is visible). Resolves { entered: boolean }. */
    @PluginMethod
    public void enterPip(PluginCall call) {
        final Activity activity = getActivity();
        if (!(activity instanceof MainActivity)) {
            JSObject ret = new JSObject();
            ret.put("entered", false);
            call.resolve(ret);
            return;
        }
        activity.runOnUiThread(() -> {
            boolean entered = ((MainActivity) activity).enterPipNow();
            JSObject ret = new JSObject();
            ret.put("entered", entered);
            call.resolve(ret);
        });
    }

    /** Called by MainActivity when the activity enters or exits PiP.
     *  Emits `pipModeChanged` so the web UI can switch layouts. */
    public static void emitPipChanged(boolean inPip) {
        RajloPip plugin = instanceRef != null ? instanceRef.get() : null;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("isInPip", inPip);
        plugin.notifyListeners("pipModeChanged", data, true);
    }
}
