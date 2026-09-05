import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, validated environment for templates.saroh.in (the public template
 * showcase).
 *
 * One variable: where the public read API lives. The showcase reads the
 * template catalogue from `api.saroh.in` rather than importing
 * `@saroh/templates` directly — that package depends on `@saroh/database`, and
 * a frontend importing it is the boundary violation the shared ESLint config
 * exists to stop. `API_URL` is server-only with `NEXT_PUBLIC_API_URL` as a
 * fallback, matching saroh.app.
 *
 * Access env through this module (`import { env } from "@/env"`) — never
 * `process.env`.
 */
export const env = createEnv({
    server: {
        API_URL: z.string().url().optional(),
    },
    client: {
        NEXT_PUBLIC_API_URL: z.string().url().optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
