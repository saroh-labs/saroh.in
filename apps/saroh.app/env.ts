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
 * knobs. `SITE_RELAY_SECRET` signs the `x-saroh-relay` header on every call
 * to the API's customer sign-in routes (ADR-011; `lib/site-relay.ts`); it
 * must be byte-identical to the API's. `SITE_ACCOUNT_AREA` (`on` | `off`,
 * unset = off) shows the customer account area — the header's Sign in /
 * account entry and `/account` — once A6–A8 and A13 have shipped
 * (`lib/account-area.ts`); switch the API's on first. `TEMPLATE_RENDERS`
 * (`on` | `off`, unset = off) serves `/template-renders`, a template drawn
 * for its sample business with no API, for the gallery's captures
 * (`lib/template-renders/guard.ts`); never on a production deployment.
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
        REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS: z.string().optional(),
        SITE_RELAY_SECRET: z.string().min(32).optional(),
        SITE_ACCOUNT_AREA: z.enum(["on", "off"]).optional(),
        TEMPLATE_RENDERS: z.enum(["on", "off"]).optional(),
        // A name kept from Vercel (DEC-107); the template renders refuse
        // `production` whatever their switch says.
        VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
        /**
         * PostHog (DEC-125), SERVER ONLY, and on purpose not `NEXT_PUBLIC_`:
         * a merchant site's visitors are the merchant's customers, and
         * nothing of PostHog's may reach their browsers. With a key, an
         * error thrown while this server renders a page is reported with
         * the site's host and the route's template, and nothing about the
         * visitor. Unset, nothing is sent. `lib/error-tracking.ts`.
         */
        POSTHOG_KEY: z
            .string()
            .regex(/^phc_[A-Za-z0-9]+$/)
            .optional(),
        POSTHOG_HOST: z.string().url().optional(),
    },
    client: {
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
        NEXT_PUBLIC_ROOT_DOMAIN: z.string().optional(),
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
    },
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        API_URL: process.env.API_URL,
        NGROK_URL: process.env.NGROK_URL,
        REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS:
            process.env.REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS,
        SITE_RELAY_SECRET: process.env.SITE_RELAY_SECRET,
        SITE_ACCOUNT_AREA: process.env.SITE_ACCOUNT_AREA,
        TEMPLATE_RENDERS: process.env.TEMPLATE_RENDERS,
        VERCEL_ENV: process.env.VERCEL_ENV,
        POSTHOG_KEY: process.env.POSTHOG_KEY,
        POSTHOG_HOST: process.env.POSTHOG_HOST,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
