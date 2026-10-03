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
 * `NEXT_PUBLIC_ACCOUNTS_URL` is where "Sign in" goes — for people already
 * invited into a business while signup is still gated behind the waitlist
 * (#261). Unset, it is the production origin, as in every other app. Sign-up
 * (open mode) is the same origin's `/signup`.
 *
 * `NEXT_PUBLIC_LAUNCH_MODE` is the site's one launch switch (plan KTD-16):
 * `waitlist` sends every "start" call to action to /waitlist and says so;
 * `open` sends it to sign-up with the plan the visitor chose. Anything but
 * `open` is waitlist, so a missing or misspelled value never points visitors
 * at a sign-up that is still gated.
 */
export const env = createEnv({
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
        NEXT_PUBLIC_LAUNCH_MODE: z.enum(["waitlist", "open"]).optional(),
    },
    server: {
        API_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_LAUNCH_MODE: process.env.NEXT_PUBLIC_LAUNCH_MODE,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
