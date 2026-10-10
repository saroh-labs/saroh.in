import { env } from "@/env";
import type { TagConfig } from "@/lib/ga";
import { tagConfig } from "@/lib/ga";

/**
 * The tags this deployment loads, read from its environment on the server
 * (`VERCEL_ENV` is not the browser's to know) and passed to the client
 * components that load them. Empty anywhere but production (`lib/ga.ts`).
 */
export function siteTagConfig(): TagConfig {
    return tagConfig({
        gaId: env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
        adsId: env.NEXT_PUBLIC_GOOGLE_ADS_ID,
        adsWaitlistLabel: env.NEXT_PUBLIC_GOOGLE_ADS_WAITLIST_LABEL,
        adsSignupLabel: env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
        pixelId: env.NEXT_PUBLIC_META_PIXEL_ID,
        vercelEnv: env.VERCEL_ENV,
    });
}
