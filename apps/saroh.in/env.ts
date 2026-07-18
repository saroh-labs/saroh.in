import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for saroh.in (the marketing site).
 *
 * The only variable the site reads is the public app origin used by the hero
 * CTA. Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    client: {
        NEXT_PUBLIC_AUTH_APP_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        NEXT_PUBLIC_AUTH_APP_URL: process.env.NEXT_PUBLIC_AUTH_APP_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
