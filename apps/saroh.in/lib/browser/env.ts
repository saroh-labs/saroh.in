import type { env } from "@/env";

/**
 * The public values code in the browser reads, without `@/env`'s validator:
 * that one brings zod and `createEnv` into every page's JS (about 30 KB),
 * only to check values the build already checked (every page's server
 * render imports `@/env`, which refuses a bad value). Next writes each
 * `process.env.NEXT_PUBLIC_*` below into the bundle as its value.
 *
 * Use it only from modules a client component or `instrumentation-client`
 * reaches; everything else keeps `@/env`.
 */
export const browserEnv = {
    NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
    NEXT_PUBLIC_LAUNCH_MODE: process.env.NEXT_PUBLIC_LAUNCH_MODE,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_REPLAY: process.env.NEXT_PUBLIC_POSTHOG_REPLAY,
    NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE:
        process.env.NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE,
    NEXT_PUBLIC_POSTHOG_ANALYTICS: process.env.NEXT_PUBLIC_POSTHOG_ANALYTICS,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
} as Pick<
    typeof env,
    | "NEXT_PUBLIC_ACCOUNTS_URL"
    | "NEXT_PUBLIC_LAUNCH_MODE"
    | "NEXT_PUBLIC_POSTHOG_KEY"
    | "NEXT_PUBLIC_POSTHOG_HOST"
    | "NEXT_PUBLIC_POSTHOG_REPLAY"
    | "NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE"
    | "NEXT_PUBLIC_POSTHOG_ANALYTICS"
    | "NEXT_PUBLIC_VERCEL_ENV"
>;
