package com.rajlodriversapp;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.Rational;
import android.webkit.CookieManager;

import androidx.annotation.NonNull;

import com.getcapacitor.BridgeActivity;
import com.rajlodriversapp.callkit.RajloCallKit;
import com.rajlodriversapp.pip.RajloPip;

/**
 * Rajlo Driver — main Capacitor activity.
 *
 * Customised solely to force-flush cookies on app pause/stop so the
 * Supabase auth session survives app close + reopen. Android's WebView
 * persists cookies async by default; on a fast app-kill, in-flight
 * writes can be lost which logs the driver out every time they reopen
 * the app. Explicit `CookieManager.flush()` writes them through.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom Capacitor plugins BEFORE super.onCreate so
        // the bridge sees them when JS calls `Capacitor.Plugins.X`.
        // RajloCallKit is the bridge to Android's Telecom framework
        // for native lockscreen / system call UI on incoming calls.
        registerPlugin(RajloCallKit.class);
        // RajloPip lets the web UI flag "driver is navigating" so we can
        // drop into Picture-in-Picture on onUserLeaveHint (below).
        registerPlugin(RajloPip.class);

        super.onCreate(savedInstanceState);

        // Belt-and-suspenders: cookies are accepted by default in
        // recent Android WebView versions, but explicit configuration
        // protects against future SDK changes / odd OEM defaults.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (bridge != null && bridge.getWebView() != null) {
            cookieManager.setAcceptThirdPartyCookies(
                bridge.getWebView(),
                true
            );
        }
    }

    @Override
    public void onUserLeaveHint() {
        // Fired when the driver actively leaves the app (Home button,
        // switching to another app — e.g. to change music). If they're
        // mid-navigation, shrink the nav screen into a Picture-in-
        // Picture window so the turn banner + map stay on top of
        // whatever they open. The WebView keeps rendering live, so
        // turn-by-turn instructions and voice continue in the float.
        //
        // Gated on RajloPip.navActive so PiP only happens during
        // immersive nav — not every time the driver backgrounds the app.
        // PiP is API 26+ (Android O); older devices just background
        // normally. Any failure is swallowed — a missing float must
        // never crash the app or block the driver from leaving.
        Log.d("RajloPip", "onUserLeaveHint navActive=" + RajloPip.navActive
            + " sdk=" + Build.VERSION.SDK_INT);
        // Manually enter PiP here on ALL supported versions (API 26+).
        // setAutoEnterEnabled (see setNavPipEnabled) is a nice-to-have,
        // but Samsung One UI silently ignores it (the task's
        // pictureInPictureParams stays null), so the manual call is the
        // path that actually works on this device — and gating it out on
        // API 31+ is exactly why nothing happened.
        if (RajloPip.navActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams.Builder builder =
                    new PictureInPictureParams.Builder();
                builder.setAspectRatio(new Rational(2, 3));
                boolean entered = enterPictureInPictureMode(builder.build());
                Log.d("RajloPip", "manual enterPiP returned " + entered);
            } catch (Exception e) {
                Log.e("RajloPip", "manual enterPiP failed", e);
            }
        }
        super.onUserLeaveHint();
    }

    /**
     * Enter PiP immediately. Called from a user gesture (the nav "Float"
     * button) while the activity is fully VISIBLE — which is the state
     * Samsung One UI requires and which onUserLeaveHint no longer
     * satisfies (the window is already hiding by then). Returns whether
     * the system accepted the request.
     */
    public boolean enterPipNow() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams params =
                    new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(2, 3))
                        .build();
                boolean entered = enterPictureInPictureMode(params);
                Log.d("RajloPip", "enterPipNow returned " + entered);
                return entered;
            } catch (Exception e) {
                Log.e("RajloPip", "enterPipNow failed", e);
            }
        }
        return false;
    }

    /**
     * API 31+ : arm / disarm auto-enter Picture-in-Picture. When armed,
     * the OS drops the activity into the PiP float by itself the moment
     * the driver leaves the app — reliable where a manual
     * enterPictureInPictureMode() in onUserLeaveHint is refused
     * (Samsung One UI, Android 14). Called from RajloPip.setNavActive as
     * the driver enters/leaves immersive nav.
     */
    public void setNavPipEnabled(boolean enabled) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                PictureInPictureParams params =
                    new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(2, 3))
                        .setAutoEnterEnabled(enabled)
                        .build();
                setPictureInPictureParams(params);
                Log.d("RajloPip", "setAutoEnterEnabled(" + enabled + ")");
            } catch (Exception e) {
                Log.e("RajloPip", "setPictureInPictureParams failed", e);
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(
        boolean isInPictureInPictureMode,
        @NonNull Configuration newConfig
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        Log.d("RajloPip", "onPictureInPictureModeChanged isInPip="
            + isInPictureInPictureMode);
        // Tell the web UI so it can swap to the compact directions-only
        // layout while floating (and back to the full nav screen on exit).
        RajloPip.emitPipChanged(isInPictureInPictureMode);
    }

    @Override
    public void onPause() {
        // Force any pending cookie writes to disk before the OS can
        // suspend / kill our process. Without this, the Supabase
        // auth-token cookie can be lost mid-write when the user
        // backgrounds the app quickly.
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    public void onStop() {
        // Same protection one level up — `onStop` fires when the
        // activity is no longer visible, which is the last reliable
        // moment to flush before the system can reclaim memory.
        CookieManager.getInstance().flush();
        super.onStop();
    }
}
