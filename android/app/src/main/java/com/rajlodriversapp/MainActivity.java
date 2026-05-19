package com.rajlodriversapp;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

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
