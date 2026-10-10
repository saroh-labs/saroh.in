import { createBrowserTracking } from "@saroh/error-tracking/browser";

import { env } from "@/env";
import { TRACKED_APP, trackedEnv } from "@/lib/error-tracking";

/**
 * The browser's error reporter for the merchant workspace (DEC-125). Null without a key:
 * then nothing is loaded and nothing is sent. With one, the SDK is fetched
 * (from this app's own bundle, never from PostHog) only when there is a
 * first error to send, or a session
 * replay that is allowed to start.
 */
export const browserTracking = createBrowserTracking({
    key: env.NEXT_PUBLIC_POSTHOG_KEY,
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    app: TRACKED_APP,
    environment: trackedEnv,
    load: () => import("posthog-js/dist/module.no-external"),
    // Session replay: the workspace only, off unless this is "on".
    replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
    loadRecorder: () => import("posthog-js/dist/posthog-recorder"),
});
