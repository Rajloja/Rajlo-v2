package com.rajlodriversapp.pip;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge that lets the web UI tell the native shell when the driver is
 * in turn-by-turn navigation, so the app can drop into Picture-in-
 * Picture (a floating window) when they leave it — e.g. to change
 * music — and keep the turn instructions on screen.
 *
 * The web side calls {@code setNavActive(true)} when the driver opens
 * the immersive nav, and {@code setNavActive(false)} when they leave
 * it. {@link com.rajlodriversapp.MainActivity#onUserLeaveHint()} reads
 * the flag to decide whether to enter PiP as the app is backgrounded.
 *
 * The flag is a static so the Activity can read it without holding a
 * reference to this plugin instance (the OS drives onUserLeaveHint from
 * its own lifecycle callbacks, not from a JS call).
 */
@CapacitorPlugin(name = "RajloPip")
public class RajloPip extends Plugin {

    /** True while the driver is in immersive turn-by-turn navigation. */
    public static volatile boolean navActive = false;

    /** JS → native: flip the nav-active flag. Called on every
     *  enter/exit of the immersive nav on the driver active-trip page. */
    @PluginMethod
    public void setNavActive(PluginCall call) {
        navActive = Boolean.TRUE.equals(call.getBoolean("active", false));
        call.resolve();
    }
}
