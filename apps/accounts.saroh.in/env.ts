import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for accounts.saroh.in (the identity UI).
 *
 * Better Auth itself runs only in api.saroh.in; this app talks to it over HTTP
 * via @saroh/auth's browser client, so the canonical NEXT_PUBLIC_BETTER_AUTH_URL
 * / NEXT_PUBLIC_ACCOUNTS_URL are validated here as client-exposed URLs.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env` — so a missing/invalid var fails fast with a clear message.
 */
export const env = createEnv({
    shared: {
        NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
    },
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
        NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
        // Where a verified user is handed off to (app.saroh.in/onboarding).
        // Optional: `lib/app-urls.ts` falls back to the standard dev/prod
        // origins, so a fresh clone needs no extra config.
        NEXT_PUBLIC_APP_URL: z.string().url().optional(),
        /**
         * PostHog (DEC-125): the project's PUBLIC key (`phc_…`) and its
         * address (the EU cloud when unset). Unset, nothing is loaded or
         * sent. The browser SDK is used for exceptions only.
         */
        NEXT_PUBLIC_POSTHOG_KEY: z
            .string()
            .regex(/^phc_[A-Za-z0-9]+$/)
            .optional(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
        /** Which environment this build is for (wrangler.jsonc, DEC-107). */
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
    },
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
