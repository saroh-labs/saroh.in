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
    },
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
