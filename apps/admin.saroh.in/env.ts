import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for admin.saroh.in.
 *
 * `ADMIN_ALLOWLIST` is the fail-closed admin gate (server-only, never exposed
 * to the browser). `NEXT_PUBLIC_ACCOUNTS_URL` is the identity app origin used
 * for sign-in redirects.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    server: {
        ADMIN_ALLOWLIST: z.string().optional(),
    },
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        ADMIN_ALLOWLIST: process.env.ADMIN_ALLOWLIST,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
