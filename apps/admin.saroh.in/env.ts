import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for admin.saroh.in.
 *
 * This app has no server-only env: it decides nothing about access. /admin/*
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
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
        // api.saroh.in origin — admin reads the control plane (/admin/*) over
        // HTTP like every other frontend; it never imports @saroh/database.
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
        NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
