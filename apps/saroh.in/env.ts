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
 * There is deliberately no auth-app URL here. This site links to no
 * authenticated surface while signup is gated (#261); the five "Start free"
 * links it used to carry hardcoded the origin anyway, so the variable that was
 * meant to hold it had never been read.
 */
export const env = createEnv({
    client: {},
    server: {
        API_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
