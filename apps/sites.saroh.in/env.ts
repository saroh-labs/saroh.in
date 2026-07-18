import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for sites.saroh.in (the multi-tenant storefront
 * renderer).
 *
 * `NEXT_PUBLIC_ROOT_DOMAIN` drives hostname → tenant resolution in middleware
 * and layouts. `REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS` and `NGROK_URL` are
 * server/dev-only knobs.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    server: {
        NGROK_URL: z.string().url().optional(),
        REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS: z.string().optional(),
    },
    client: {
        NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
    },
    runtimeEnv: {
        NGROK_URL: process.env.NGROK_URL,
        REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS:
            process.env.REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS,
        NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
