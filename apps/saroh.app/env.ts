import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for saroh.app (the multi-tenant storefront
 * renderer).
 *
 * `NEXT_PUBLIC_ROOT_DOMAIN` drives hostname → tenant resolution in middleware
 * and layouts. `API_URL` (server-only, with `NEXT_PUBLIC_API_URL` as a public
 * fallback) is the origin of the PUBLIC read API (api.saroh.in) that the
 * renderer hits for a site's immutable publication snapshot.
 * `REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS` and `NGROK_URL` are server/dev-only
 * knobs.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    server: {
        API_URL: z.string().url().optional(),
        NGROK_URL: z.string().url().optional(),
        REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS: z.string().optional(),
    },
    client: {
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
        NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
        NGROK_URL: process.env.NGROK_URL,
        REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS:
            process.env.REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
