import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for saroh.in (the marketing site).
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 *
 * `API_URL` is server-only on purpose: only the /api/waitlist route handler
 * talks to api.saroh.in, and the browser has no reason to know that origin.
 *
 * `NEXT_PUBLIC_ACCOUNTS_URL` is where "Sign in" goes — for people already
 * invited into a business while signup is still gated behind the waitlist
 * (#261). Unset, it is the production origin, as in every other app.
 */
export const env = createEnv({
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
    },
    server: {
        API_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
