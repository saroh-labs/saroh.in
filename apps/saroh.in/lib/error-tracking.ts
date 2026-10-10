import { trackedEnvironment } from "@saroh/error-tracking";
import type { AppTrackingSettings } from "@saroh/error-tracking/server";

import { env } from "@/env";

/**
 * This app's PostHog settings (DEC-123), for saroh.in. Exceptions only.
 * Everything is off without a key: `NEXT_PUBLIC_POSTHOG_KEY` is the project's
 * public key, the same one the browser gets, so the server reads it too.
 */
export const TRACKED_APP = "web" as const;

export const trackingSettings: AppTrackingSettings = {
    key: env.NEXT_PUBLIC_POSTHOG_KEY,
    host: env.NEXT_PUBLIC_POSTHOG_HOST,
    app: TRACKED_APP,
    vercelEnv: env.NEXT_PUBLIC_VERCEL_ENV,
};

export const trackedEnv = trackedEnvironment(env.NEXT_PUBLIC_VERCEL_ENV);
