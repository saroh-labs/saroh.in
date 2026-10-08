import { config as loadEnvFiles } from "dotenv";
import { z } from "zod";

import { TRUST_PROXY_MODES } from "./common/trust-proxy";

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
    // Which proxies may say who the client is (`src/common/trust-proxy.ts`):
    // the request's IP — every rate limiter's key — is the first address in
    // `X-Forwarded-For` that is not one of them. `cloudflare` (default):
    // Cloudflare's edge plus the private network, for Cloudflare → Traefik on
    // Coolify, and portless locally. `private`: a proxy in front, no CDN.
    // `none`: the API is reached directly (`dev:app`, a bare port).
    TRUST_PROXY: z.enum(TRUST_PROXY_MODES).default("cloudflare"),

    // Data (REQUIRED — the one true prerequisite; the api cannot serve any
    // request without a database).
    DATABASE_URL: z.string().url(),
    // Auth secret: REQUIRED in production, OPTIONAL elsewhere. When unset in
    // dev/test the @saroh/auth layer (resolveAuthSecret) supplies a fixed,
    // insecure dev fallback with a warning, so a fresh clone boots with just
    // DATABASE_URL. Must be byte-identical across the api + session-validating
    // apps in any shared environment.
    BETTER_AUTH_SECRET: z.string().min(1).optional(),
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
    // The merchant-site renderer's own address (saroh.app), for links a
    // customer opens there — product review invitations. Unset: the local
    // renderer in development, the production one everywhere else.
    RENDERER_URL: z.string().url().optional(),
    // The sign-in app's own address (accounts), for links someone opens to
    // create their account — waitlist invitations. Unset: the local accounts
    // app in development, and no invitation link anywhere else.
    ACCOUNTS_URL: z.string().url().optional(),
    // The API's own public address (e.g. https://api.saroh.in), which payment
    // providers send webhooks to. Merchants paste the address built from it
    // into their Razorpay dashboard, so it must stay stable. Unset: setup shows
    // no webhook address and says so (DEC-063); nothing is guessed.
    API_PUBLIC_URL: z.string().url().optional(),

    // Object storage (S2-008 — media uploads via @saroh/object-storage).
    // All optional: when the R2 credentials below are absent the media module
    // falls back to the network-free in-memory adapter for local/dev/offline.
    R2_ENDPOINT: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_PUBLIC_BASE_URL: z.string().optional(),

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
    // Saroh's sender for a business's email while it has no provider of its
    // own (DEC-086): its own address on the notify subdomain, and the SES
    // configuration set its bounces and complaints are measured on. The
    // credentials are the SMTP_* set above.
    SAROH_BUSINESS_EMAIL_FROM: z.string().email().optional(),
    SAROH_BUSINESS_EMAIL_CONFIG_SET: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,64}$/)
        .optional(),
    // The global stop for that route: "true" stops every business's Saroh
    // email at once, queued and retrying ones included, whatever each
    // business's SAROH_BUSINESS_EMAIL flag says (the complaint alarm's
    // runbook step). Checked on every send and queued job
    // (`communications/saroh-may-send.ts`), but env is read at boot, so it
    // takes effect once the API and workers restart with it set; for an
    // instant stop, turn off the business's SAROH_BUSINESS_EMAIL flag.
    SAROH_BUSINESS_EMAIL_STOP: z.enum(["true", "false"]).optional(),
    // At most this many Saroh-sent business emails in any 24 hours, for
    // every business together, so sign-in codes keep their room on the SES
    // account. Unset: `SAROH_DAILY_CEILING_DEFAULT` (1,000).
    SAROH_BUSINESS_EMAIL_DAILY_CEILING: z.coerce
        .number()
        .int()
        .positive()
        .optional(),

    // Sign-in codes for a business's customers on its own site (ADR-011,
    // round-2 plan A, A2). Every one is optional in the schema so dev and
    // test boot without them; `site-accounts/site-secrets.ts` checks the two
    // secrets AT USE and refuses to run on a fixed dev value anywhere but
    // development and test. Never logged.
    //
    // The shared secret that signs `x-saroh-relay` — the visitor's address
    // and the host saroh.app served. Byte-identical in api and saroh.app.
    SITE_RELAY_SECRET: z.string().min(32).optional(),
    // The key the destination email and the code are HMAC'd under, so a
    // database read reveals neither who asked nor the code.
    SITE_ACCOUNTS_CODE_SECRET: z.string().min(32).optional(),
    // Signs the pricing draft-preview token staff mint in the admin console
    // (plans catalogue KTD-10): at most 15 minutes, bound to one draft
    // revision. API only — saroh.in passes the token through, never checks
    // it. Read at use (`pricing/pricing-secrets.ts`): development and test
    // fall back to a fixed public value, anywhere else preview is refused
    // until it is set. Never logged.
    PRICING_PREVIEW_SECRET: z.string().min(32).optional(),
    // saroh.in's on-demand revalidation hook (plans catalogue KTD-10): after
    // a publish commits, and at a scheduled version's go-live, a job POSTs to
    // `<PRICING_SITE_URL>/api/revalidate` with the secret in `x-saroh-revalidate`. Both unset:
    // nothing is queued, and saroh.in picks the change up on its ISR timer.
    // The secret is byte-identical in saroh.in. Never logged.
    PRICING_SITE_URL: z.string().url().optional(),
    PRICING_REVALIDATE_SECRET: z.string().min(32).optional(),
    // saroh.in is static: a publish starts its build instead (plans catalogue
    // KTD-10). A fine-grained GitHub token allowed only to run this repo's
    // Actions, and which environment to build (`main` for production,
    // `development` for development). Both set, they win over the hook above.
    // The token is never logged.
    SITE_DEPLOY_GITHUB_TOKEN: z.string().min(20).optional(),
    SITE_DEPLOY_ENVIRONMENT: z.enum(["development", "production"]).optional(),
    SITE_DEPLOY_GITHUB_REPO: z
        .string()
        .regex(/^[\w.-]+\/[\w.-]+$/)
        .optional(),
    // Cloudflare Turnstile, the bot challenge a code needs past a shared
    // ceiling. Unset: no challenge is ever asked (and an ERROR says when one
    // would have been), so a customer is never stuck on a widget that can't load.
    TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // The code email's own sending address and stream, apart from workspace
    // sign-in mail. The SMTP_* set below is the fallback transport.
    SITE_CODES_EMAIL_FROM: z.string().email().optional(),
    SITE_CODES_SMTP_HOST: z.string().optional(),
    SITE_CODES_SMTP_PORT: z.string().optional(),
    SITE_CODES_SMTP_USER: z.string().optional(),
    SITE_CODES_SMTP_PASS: z.string().optional(),
    // `true` / `false`: whether that SMTP connection starts in TLS. Unset,
    // the port decides — 465 is TLS, anything else STARTTLS.
    SITE_CODES_SMTP_SECURE: z.enum(["true", "false"]).optional(),
    // With no SMTP: `log` prints the code (development's default) and leaves
    // it where a local browser test reads it; `fail` makes every send fail,
    // to see the "couldn't send" path and alert. Development, or named
    // outright off production (the CI browser stack); never in production.
    SITE_CODES_EMAIL_FAKE: z.enum(["log", "fail"]).optional(),
    // The opening-day launch offer (marketing plan U31, OQ-1): how many days
    // of the offer plan a business made through a waitlist invite gets, from
    // the moment it is made. The owner's number, set per instance, never
    // committed. Unset, no invite can be sent and none grants an offer.
    LAUNCH_OFFER_DAYS: z.coerce.number().int().min(1).max(366).optional(),
    // Web addresses kept for Saroh beyond the built-in list in
    // `sites/site-address.ts`: comma-separated, set per instance. People's
    // names (the founders' own sites) live here, not in the public repo.
    RESERVED_ADDRESSES_EXTRA: z.string().optional(),
    // The customer account area on merchant sites (round-2 plan A, A5):
    // `on` serves `public/site-accounts/me`, home and receipts; anything else
    // (unset included) answers 404, so the area stays dark until A6–A8 and
    // A13 ship with it (waves plan, release boundary 4). saroh.app has its
    // own `SITE_ACCOUNT_AREA`, which hides the header entry and the pages;
    // this one is the server half that keeps it private.
    SITE_ACCOUNT_AREA: z.enum(["on", "off"]).optional(),
    // TEST ONLY. Hosts the link preview tool may fetch although they resolve
    // to loopback (comma-separated, e.g. `localhost`): the browser tests
    // point it at a page served on the test machine, which the SSRF guard
    // refuses otherwise. Loopback only, never a private range. Refused at
    // boot under NODE_ENV=production (below), and honoured by the tool only
    // in a test run — NODE_ENV declared `test`, or `CI` set — never under a
    // declared production (`link-preview/ssrf-guard.ts`, `testHostsFrom`).
    LINK_PREVIEW_TEST_HOSTS: z.string().optional(),
    // Set by CI runners (GitHub sets `true`) and by `scripts/prepush.sh`'s
    // browser-test stack (`1`). Read only to mark a test run for test-only
    // switches; never set it on a deployed host.
    CI: z.string().optional(),

    // Payments (S5-002 — org merchant credential encryption at rest).
    // A 32-byte AES-256-GCM key, supplied as base64 or 64-hex. OPTIONAL in the
    // schema so dev/test can boot without payments configured; the payments
    // crypto module validates its presence + length AT USE time (the moment a
    // credential is en/decrypted) and throws a clear error if it is
    // missing/malformed. Never logged.
    PAYMENTS_ENC_KEY: z.string().optional(),
    // Which Cashfree the API talks to, for merchants' payments and Saroh's own
    // billing alike: `sandbox` for test credentials, `production` (default)
    // for live ones. The API sends the mode with every checkout's client
    // parameters, so the browser drop-in opens where the order was made.
    CASHFREE_ENV: z.enum(["production", "sandbox"]).default("production"),

    // Saroh's own invoices to businesses for their plan (pricing catalogue
    // U17), read at use by `billing/saroh-seller.ts`. All optional so dev and
    // test boot without them; never hard-coded. Unset GSTIN: the paper is an
    // "Invoice", not a tax invoice, and `saroh_invoice_seller_incomplete` is
    // logged. Unset state: the GSTIN's first two digits.
    SAROH_LEGAL_NAME: z.string().optional(),
    SAROH_GSTIN: z
        .string()
        .regex(/^[0-9]{2}[A-Z0-9]{13}$/, "a 15-character GSTIN")
        .optional(),
    // GST state code of Saroh's registration ("29"): CGST + SGST for a
    // business in the same state, IGST otherwise.
    SAROH_GST_STATE: z
        .string()
        .regex(/^[0-9]{2}$/, "a two-digit GST state code")
        .optional(),
    // The registered address printed on the paper, one line.
    SAROH_REGISTERED_ADDRESS: z.string().optional(),
    // The contact address printed on the paper and the billing email's reply-to.
    SAROH_BILLING_EMAIL: z.string().email().optional(),
    // The SAC printed against each line.
    SAROH_INVOICE_SAC: z
        .string()
        .regex(/^[0-9]{4,8}$/, "a 4–8 digit SAC")
        .optional(),
    // The series prefix: 1–3 capitals or digits (SRH → SRH/26-27/00001).
    SAROH_INVOICE_PREFIX: z
        .string()
        .regex(/^[A-Z0-9]{1,3}$/, "1–3 capitals or digits")
        .optional(),

    // Saroh STAFF break-glass bootstrap (S1-012 admin). Comma-separated emails
    // that are treated as platform admins even with no PlatformAdmin row. This
    // is ONLY how the first admin is seeded (and how access is recovered if every
    // grant is revoked by mistake) — day-to-day staff live in the table, so this
    // should normally hold one break-glass address or be empty. Unset = nobody,
    // and the guard still fails closed.
    ADMIN_ALLOWLIST: z.string().optional(),

    // Set automatically by npm/pnpm run scripts; used for the health probe.
    // Background job worker (S3-003 — durable JobQueue outbox + worker).
    // All optional with sane defaults; the poll loop is disabled under
    // NODE_ENV=test regardless of these values.
    JOB_WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
    JOB_WORKER_BATCH: z.coerce.number().int().positive().default(10),
    // Visibility timeout: a job stuck PROCESSING longer than this (its worker
    // crashed mid-flight) is reclaimed by the next claim. Default 5 min.
    JOB_VISIBILITY_MS: z.coerce.number().int().positive().default(300_000),

    // Error tracking (#103). Off when unset: every 5xx is still logged, and
    // nothing leaves the process. No tracker SDK is installed yet, so a value
    // here only logs a warning at startup — see
    // src/common/observability/report-error.ts and
    // docs/architecture/ERROR_TRACKING_AND_UPTIME.md.
    ERROR_TRACKING_DSN: z.string().url().optional(),

    npm_package_version: z.string().optional(),
});

/**
 * Variables a deployed API cannot do without (NODE_ENV=production): unset,
 * it would send customers and staff links to production's sites from any
 * host (the fallbacks used to be `https://saroh.app` and
 * `https://app.saroh.in`), or mail from an address nobody chose. Required
 * at boot, so a missing one stops the deploy instead (plan
 * 2026-10-05-001, KTD-2).
 */
const REQUIRED_IN_PRODUCTION = [
    "RENDERER_URL",
    "APP_URL",
    "EMAIL_FROM",
] as const;

const checkedSchema = envSchema.superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    if (value.LINK_PREVIEW_TEST_HOSTS) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["LINK_PREVIEW_TEST_HOSTS"],
            message: "test only: never set when NODE_ENV=production",
        });
    }
    for (const key of REQUIRED_IN_PRODUCTION) {
        if (!value[key]) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [key],
                message: "required when NODE_ENV=production",
            });
        }
    }
});

/** Parse an environment the way the API does at boot (exported for tests). */
export function parseEnv(
    source: Record<string, string | undefined>,
): ReturnType<typeof checkedSchema.safeParse> {
    return checkedSchema.safeParse(source);
}

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

    const parsed = parseEnv(source);
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

/**
 * `NODE_ENV` as the process was actually given it — the shell, the run
 * script or `.env` — before the schema's `development` default. A gate that
 * hands out something unsafe outside development (the public site-secret
 * fallbacks, the fake code email) reads this, never `env.NODE_ENV`, so a
 * host that forgot to set `NODE_ENV` stays closed (review A-4).
 */
export const declaredNodeEnv: string | undefined =
    process.env.NODE_ENV === "" ? undefined : process.env.NODE_ENV;
