import { createBrowserTracking } from "@saroh/error-tracking/browser";

import { env } from "@/env";
import { TRACKED_APP, trackedEnv } from "@/lib/error-tracking";

/**
 * The browser's error reporter for saroh.in (DEC-125). Null without a key:
 * then nothing is loaded and nothing is sent. With one, the SDK is fetched
 * (from this app's own bundle, never from PostHog) only when there is a
 * first error to send, or a session replay that is allowed to start: the
 * switch is on and the visitor accepted the cookie notice
 * (`app/site-tags.tsx`).
 */
export const browserTracking = createBrowserTracking({
    key: env.NEXT_PUBLIC_POSTHOG_KEY,
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    app: TRACKED_APP,
    environment: trackedEnv,
    load: () => import("posthog-js/dist/module.no-external"),
    // Session replay: off unless this is "on", and then only after consent.
    replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
    replaySample: env.NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE,
    loadRecorder: () => import("posthog-js/dist/posthog-recorder"),
});
