/**
 * No-FOUC theme bootstrap.
 *
 * Loaded with <Script strategy="beforeInteractive" src="/no-fouc.js" />
 * from the root layout so it runs BEFORE first paint, preventing a
 * dark-mode user from flashing white on every navigation.
 *
 * Why an external file instead of inline `dangerouslySetInnerHTML`:
 * React 19 + Next.js 16 warns on every inline <script> element,
 * including <Script dangerouslySetInnerHTML>, because the script
 * never re-executes on client navigation. Externalizing is the
 * canonical fix; `strategy="beforeInteractive"` guarantees it loads
 * before any first-party Next.js code does.
 *
 * KEEP IN SYNC with the KEY constant in src/lib/preferences-client.ts.
 * If that key changes, this file's lookup string must change too.
 */
(function () {
  try {
    var raw = window.localStorage.getItem("rajlo:prefs");
    if (!raw) {
      document.documentElement.setAttribute("data-theme", "light");
      return;
    }
    var p = JSON.parse(raw);
    var theme =
      p && (p.theme === "light" || p.theme === "dark" || p.theme === "system")
        ? p.theme
        : "light";
    document.documentElement.setAttribute("data-theme", theme);
    if (p && p.locale === "patois") {
      document.documentElement.setAttribute("lang", "jam");
    }
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
