import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for help.saroh.in (the old help site).
 *
 * `MARKETING_URL` (server-only) is the marketing site's origin, where every
 * request goes once Help moves to `saroh.in/help` (17 Oct 2026,
 * `lib/moved-to-saroh-in.ts`). Unset, it is production's
 * `https://www.saroh.in`, the host saroh.in serves its pages on. A
 * non-production deployment may point it at its own marketing site
 * (`https://saroh.io` on the dev environment).
 */
export const env = createEnv({
    server: {
        MARKETING_URL: z.string().url().optional(),
    },
    client: {},
    runtimeEnv: {
        MARKETING_URL: process.env.MARKETING_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
