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
    shared: {
        NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
    },
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
        /**
         * The hostname a merchant's own domain should CNAME to once verified
         * (#200). Shown as the routing record on the settings screen.
         */
        NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET: z.string().optional(),
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
        /**
         * PostHog (DEC-123): the project's PUBLIC key (`phc_…`) and its
         * address (the EU cloud when unset). Unset, nothing is loaded or
         * sent. The browser SDK is used for exceptions only, and for the workspace's masked session replay when
         * NEXT_PUBLIC_POSTHOG_REPLAY is "on" (off by default).
         */
        NEXT_PUBLIC_POSTHOG_KEY: z
            .string()
            .regex(/^phc_[A-Za-z0-9]+$/)
            .optional(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
        NEXT_PUBLIC_POSTHOG_REPLAY: z.enum(["on", "off"]).optional(),
    },
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        API_URL: process.env.API_URL,
        NGROK_URL: process.env.NGROK_URL,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
        NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
        NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET:
            process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_POSTHOG_REPLAY: process.env.NEXT_PUBLIC_POSTHOG_REPLAY,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
