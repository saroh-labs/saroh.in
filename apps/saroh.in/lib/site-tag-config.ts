import { env } from "@/env";
import type { TagConfig } from "@/lib/ga";
import { tagConfig } from "@/lib/ga";
import { siteRecordingOn } from "@/lib/site-recording";

/**
 * What this deployment loads behind the cookie notice, read from its
 * environment on the server (`VERCEL_ENV` is not the browser's to know) and
 * passed to the client components that load it: the tags' ids, empty
 * anywhere but production (`lib/ga.ts`), and whether session replay is
 * switched on (`lib/site-recording.ts`, which only production's vars say).
 */
export function siteTagConfig(): TagConfig {
    const config = tagConfig({
        gaId: env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
        adsId: env.NEXT_PUBLIC_GOOGLE_ADS_ID,
        adsWaitlistLabel: env.NEXT_PUBLIC_GOOGLE_ADS_WAITLIST_LABEL,
        adsSignupLabel: env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
        pixelId: env.NEXT_PUBLIC_META_PIXEL_ID,
        vercelEnv: env.VERCEL_ENV,
    });
    const recording = siteRecordingOn({
        key: env.NEXT_PUBLIC_POSTHOG_KEY,
        replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
    });
    return recording ? { ...config, recording: true } : config;
}
