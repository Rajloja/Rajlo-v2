import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Rajlo Driver native shell.
 *
 * This wraps the existing Next.js web app in a thin native container
 * so we can:
 *   - Stream GPS reliably in the background (the killer feature —
 *     browser geolocation pauses when the phone screen locks).
 *   - Deliver native push notifications for new ride requests.
 *   - Show in the app stores.
 *
 * Architecture: the native app is a WebView that loads the live
 * driver portal (`server.url`) at startup. All of the existing
 * Next.js code — pages, API routes, auth, proxy — runs on the same
 * server. The native layer only kicks in for background GPS + push.
 *
 * The bundled webDir (`capacitor-shell/`) is shown if the remote URL
 * fails to load (rare — usually only when offline at first launch).
 */

const config: CapacitorConfig = {
  appId: "com.rajlo.driver",
  appName: "Rajlo Driver",
  // Minimal offline-fallback shell. The real UI loads from server.url.
  webDir: "capacitor-shell",
  // Drop Capacitor's verbose logging in production builds — every
  // bridge call writes to Logcat at high frequency on hot paths
  // (every GPS ping, every chat realtime event). On long-lived
  // sessions this adds measurable WebView jank.
  loggingBehavior: "production",
  // Loading the live Next.js app instead of bundling. The driver
  // portal logic, auth gates, and proxy all live there.
  //
  // Points at the production driver subdomain. The proxy scopes
  // driver.rajlo.com to the driver portal, and an unauthenticated
  // launch lands on /auth/driver/login automatically.
  server: {
    url: "https://driver.rajlo.com/driver",
    // `cleartext: false` blocks plaintext HTTP — defends against
    // anyone trying to redirect the app at an HTTP fake.
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      // Max ceiling — the WebView usually paints within ~600-900ms
      // on a warm cache. Our root layout calls SplashScreen.hide()
      // the moment React mounts to drop the splash sooner; this
      // duration is just the failsafe for very slow first launches.
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#F10100", // Rajlo red — splash matches the launcher tile
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Rajlo-black status bar so the system strip blends with the
      // dark brand. White icons on top via `style: "DARK"` (Capacitor
      // names: DARK = light icons, designed for dark backgrounds).
      backgroundColor: "#111906",
      style: "DARK",
      // Without this Android draws the WebView edge-to-edge under the
      // status bar, hiding the top of the page behind the battery/wifi
      // icons. Setting it false reserves the status bar's height for
      // itself so app content always starts below.
      overlaysWebView: false,
    },
    BackgroundGeolocation: {
      // Background geolocation is the whole reason we wrap. The plugin
      // posts a sticky notification while tracking on Android (required
      // by the foreground service). Copy below shows up there.
      backgroundMessage: "Rajlo is sharing your location for an active trip.",
      backgroundTitle: "Rajlo Driver",
      // Re-prompt the driver if they revoke permissions.
      requestPermissions: true,
      // Minimum accuracy to accept a fix, in metres. iOS/Android
      // sometimes return wild jumps; <100m keeps the rider's marker
      // believable.
      distanceFilter: 10,
    },
  },
  android: {
    // Allow the WebView to load mixed-origin assets (Maps, etc).
    allowMixedContent: false,
    // Match the launch screen colour so there's no flash of white
    // between the splash and the WebView painting.
    backgroundColor: "#F10100",
    // Disable the WebView remote-debugging bridge in production —
    // it adds attach overhead even when no debugger is connected.
    // Re-enable temporarily by setting this to `true` when debugging.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
