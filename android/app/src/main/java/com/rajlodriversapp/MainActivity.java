package com.rajlodriversapp;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
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
        if (RajloPip.navActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams.Builder builder =
                    new PictureInPictureParams.Builder();
                // Portrait-ish window that matches the nav screen shape,
                // so the top turn banner reads cleanly when shrunk.
                builder.setAspectRatio(new Rational(2, 3));
                enterPictureInPictureMode(builder.build());
            } catch (Exception ignored) {
                // Some OEMs / users disable PiP at the system level —
                // fall through to a normal background.
            }
        }
        super.onUserLeaveHint();
    }

    @Override
    public void onPictureInPictureModeChanged(
        boolean isInPictureInPictureMode,
        @NonNull Configuration newConfig
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
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
