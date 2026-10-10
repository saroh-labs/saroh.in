import { setErrorReporter } from "@saroh/ui/lib/report-error";

import { browserTracking } from "@/lib/error-tracking-browser";

/**
 * Runs in the browser before the merchant workspace becomes interactive (Next's
 * `instrumentation-client`). With a PostHog key (DEC-123), every error
 * boundary's report (`@saroh/ui/lib/report-error`) and the window's uncaught
 * errors go to PostHog, scrubbed, each once a session. Without a key this
 * does nothing. No pageviews, no clicks, no cookies.
 */
if (browserTracking) {
    const tracking = browserTracking;
    setErrorReporter((report) => {
        tracking.report(report);
    });
    tracking.watchWindow();
}
