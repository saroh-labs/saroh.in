import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for app.saroh.in (the merchant dashboard).
 *
 * Server data-access modules (lib/**\/service.ts) forward the session cookie to
 * api.saroh.in; the api origin is resolved from `API_URL` (server-only) with
 * the public `NEXT_PUBLIC_*` origins as fallbacks. `NGROK_URL` is a dev-only
 * tunnel origin. Everything the browser needs is NEXT_PUBLIC_*.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    server: {
        API_URL: z.string().url().optional(),
        NGROK_URL: z.string().url().optional(),
    },
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
        NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
        /**
         * The host a merchant's subdomain hangs off — `saroh.app`, not the
         * marketing site. The sites index used to build that address from a
         * hardcoded `.saroh.in`, which meant the one place in the product that
         * tells a merchant where their website lives was a string literal in a
         * component, unrelated to the value the renderer actually resolves
         * tenants by. It is the same variable saroh.app reads, so the two
         * cannot disagree.
         */
        NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
        NGROK_URL: process.env.NGROK_URL,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
        NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
