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
    // The release switches (`lib/feature-switches.ts`): the feature lists
    // reach browser code through the tools' and the nav's imports.
    NEXT_PUBLIC_TEMPLATES: process.env.NEXT_PUBLIC_TEMPLATES,
    NEXT_PUBLIC_AI_APPS: process.env.NEXT_PUBLIC_AI_APPS,
    NEXT_PUBLIC_ASK_AI: process.env.NEXT_PUBLIC_ASK_AI,
    NEXT_PUBLIC_SOCIAL: process.env.NEXT_PUBLIC_SOCIAL,
    NEXT_PUBLIC_DEVELOPERS: process.env.NEXT_PUBLIC_DEVELOPERS,
    NEXT_PUBLIC_DOCS: process.env.NEXT_PUBLIC_DOCS,
    NODE_ENV: process.env.NODE_ENV,
    /** `API_URL`, written in by next.config.js `env` (the header's session check). */
    SAROH_API_URL: process.env.SAROH_API_URL,
} as { SAROH_API_URL?: string } & Pick<
    typeof env,
    | "NEXT_PUBLIC_ACCOUNTS_URL"
    | "NEXT_PUBLIC_LAUNCH_MODE"
    | "NEXT_PUBLIC_POSTHOG_KEY"
    | "NEXT_PUBLIC_POSTHOG_HOST"
    | "NEXT_PUBLIC_POSTHOG_REPLAY"
    | "NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE"
    | "NEXT_PUBLIC_POSTHOG_ANALYTICS"
    | "NEXT_PUBLIC_VERCEL_ENV"
    | "NEXT_PUBLIC_TEMPLATES"
    | "NEXT_PUBLIC_AI_APPS"
    | "NEXT_PUBLIC_ASK_AI"
    | "NEXT_PUBLIC_SOCIAL"
    | "NEXT_PUBLIC_DEVELOPERS"
    | "NEXT_PUBLIC_DOCS"
    | "NODE_ENV"
>;
