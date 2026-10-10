import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for admin.saroh.in.
 *
 * Its one server-only variable is where the public site lives
 * (`MARKETING_SITE_URL`); it decides nothing about access. /admin/*
 * authorization lives entirely in api.saroh.in (`PlatformAdminGuard` requires
 * an active, non-revoked grant; `PlatformPermissionGuard` fails closed). Admin
 * forwards the session cookie and renders whatever the API allows.
 *
 * `ADMIN_ALLOWLIST` used to be declared here and described as "the fail-closed
 * admin gate". It was read by exactly one local helper that nothing called, so
 * the description pointed anyone changing admin access at the wrong service.
 * The allowlist is an api.saroh.in break-glass bootstrap for the first or
 * recovery platform owner; when it is the reason a request got through, the
 * API says so via the `viaBootstrap` flag, which is what the break-glass
 * banner renders from.
 *
 * `NEXT_PUBLIC_ACCOUNTS_URL` is the identity app origin used for sign-in
 * redirects.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    server: {
        // The public site, for Plans & modules' pricing page and its draft
        // preview. Absent: the console's own domain without `admin.`.
        MARKETING_SITE_URL: z.string().url().optional(),
    },
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
        // api.saroh.in origin — admin reads the control plane (/admin/*) over
        // HTTP like every other frontend; it never imports @saroh/database.
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
        NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
        /**
         * PostHog (DEC-123): the project's PUBLIC key (`phc_…`) and its
         * address (the EU cloud when unset). Unset, nothing is loaded or
         * sent. The browser SDK is used for exceptions only.
         */
        NEXT_PUBLIC_POSTHOG_KEY: z
            .string()
            .regex(/^phc_[A-Za-z0-9]+$/)
            .optional(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
        /** Which environment this build is for (wrangler.jsonc, DEC-107). */
        NEXT_PUBLIC_VERCEL_ENV: z
            .enum(["development", "preview", "production"])
            .optional(),
    },
    runtimeEnv: {
        MARKETING_SITE_URL: process.env.MARKETING_SITE_URL,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
