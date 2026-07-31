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
 */
export const env = createEnv({
    client: {
        NEXT_PUBLIC_AUTH_APP_URL: z.string().url().optional(),
    },
    server: {
        API_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        NEXT_PUBLIC_AUTH_APP_URL: process.env.NEXT_PUBLIC_AUTH_APP_URL,
        API_URL: process.env.API_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
