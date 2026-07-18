import { config as loadEnvFiles } from "dotenv";
import { z } from "zod";

/**
 * Typed, validated environment for api.saroh.in (NestJS).
 *
 * NOTE: @t3-oss/env-core is ESM-only (`"type": "module"`, exports-map only),
 * which does not resolve/emit cleanly from this CommonJS Nest app. We therefore
 * validate with zod directly here — same contract as t3-env: values are parsed
 * once at import time, empty strings are treated as undefined, and a
 * missing/invalid required variable throws a clear error listing exactly what
 * is wrong. The Next apps use @t3-oss/env-nextjs (ESM/bundler-friendly).
 *
 * Validation runs at import time, before Nest bootstraps. Nest's ConfigModule
 * loads the same files at `NestFactory.create` time, but that is too late for
 * this module, so we mirror its `envFilePath` order here (real process.env
 * always wins — dotenv never overrides already-set vars).
 *
 * Canonical Better Auth names only: `BETTER_AUTH_SECRET` must be byte-identical
 * to the value the session-validating apps use, or session validation fails.
 */
loadEnvFiles({ path: [".env.local", ".env"] });

const envSchema = z.object({
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: z.coerce.number().default(3333),

    // Data + auth (required — the api cannot serve requests without them).
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url().optional(),
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),

    // OAuth providers (optional — email/password works without them).
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),

    // CORS + links.
    CORS_ORIGIN: z.string().optional(),
    APP_URL: z.string().url().optional(),

    // Email (Nodemailer). Legacy aliases kept until callers converge.
    EMAIL_FROM: z.string().optional(),
    SENDER_EMAIL_ID: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_HOSTNAME: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_SECURE: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    USER_ACCOUNT: z.string().optional(),
    USER_PASSWORD: z.string().optional(),

    // Set automatically by npm/pnpm run scripts; used for the health probe.
    npm_package_version: z.string().optional(),
});

function loadEnv(): z.infer<typeof envSchema> {
    if (process.env.SKIP_ENV_VALIDATION) {
        return process.env as unknown as z.infer<typeof envSchema>;
    }

    // Mirror t3-env's `emptyStringAsUndefined`: an unset var and an empty one
    // are treated identically, so optional-with-default behaves as expected.
    const source: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) {
        source[key] = value === "" ? undefined : value;
    }

    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
        console.error(`❌ Invalid environment variables:\n${issues}`);
        throw new Error(
            "Invalid environment variables — see the list above. Copy .env.example to .env and fill in the required values.",
        );
    }
    return parsed.data;
}

export const env = loadEnv();
