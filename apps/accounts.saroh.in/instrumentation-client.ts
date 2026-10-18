import { setErrorReporter } from "@saroh/ui/lib/report-error";

import { browserTracking } from "@/lib/error-tracking-browser";
import { untrackedPage } from "@/lib/untracked-pages";

/**
 * Runs in the browser before accounts (sign-in) becomes interactive (Next's
 * `instrumentation-client`). With a PostHog key (DEC-125), every error
 * boundary's report (`@saroh/ui/lib/report-error`) and the window's uncaught
 * errors go to PostHog, scrubbed, each once a session. Without a key this
 * does nothing. No pageviews, no clicks, no cookies.
 */
if (browserTracking) {
    const tracking = browserTracking;
    // Nothing from a page error tracking leaves out (`lib/untracked-pages.ts`,
    // the staff invite's), whenever the browser is on it.
    const here = () => untrackedPage(window.location.pathname);
    setErrorReporter((report) => {
        if (!here()) tracking.report(report);
    });
    const guarded: Pick<Window, "addEventListener"> = {
        addEventListener: (
            type: string,
            listener: EventListenerOrEventListenerObject,
        ) => {
            window.addEventListener(type, (event) => {
                if (here()) return;
                if (typeof listener === "function") listener(event);
                else listener.handleEvent(event);
            });
        },
    };
    tracking.watchWindow(guarded);
}
