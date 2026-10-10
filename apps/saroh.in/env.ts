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
 *
 * `SITE_RELAY_SECRET` (server-only, 32+ characters, byte-identical to the
 * API's) signs the visitor's address into `x-saroh-relay` on /api/waitlist's
 * call (plan U30, `lib/waitlist-forward.ts`), so the API's rate limit counts
 * each visitor rather than this server. Development and test sign with the
 * API's fixed dev value; unset anywhere else, joins still go through but are
 * all counted as one, and an error is logged.
 *
 * `API_URL` also feeds the pricing pages (plan U24): `/pricing`, the plan
 * teasers and the free-plan line read `GET {API_URL}/public/pricing`. Unset,
 * they show the "Pricing announced at launch" placeholder.
 *
 * `PRICING_REVALIDATE_SECRET` (server-only, 32+ characters) is the shared
 * secret the API sends in `x-saroh-revalidate` when it calls
 * `POST /api/revalidate` after a pricing version is published or goes live
 * (KTD-10). The same value is set in the API. Unset, the hook refuses every
 * call and the pages refresh on their five-minute timer only.
 * `API_URL` also feeds the waitlist's launch offer
 * (`GET {API_URL}/public/waitlist/offer`). Unset, the page says the offer is
 * announced at launch. A production deployment refuses to build without it
 * (`next.config.js`): unset, every waitlist join is dropped, which went
 * unseen for two days after Gate W.
 *
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` turns Google Analytics on, and only on a
 * production deployment (`VERCEL_ENV`, a name kept from Vercel, which only
 * the production Worker's wrangler.jsonc sets to `production`): previews, local dev and the browser tests never load the tag,
 * even with the id in a local `.env`, so test runs never count as visitors
 * (they were most of GA's "visitors" until 5 Oct). `lib/ga.ts` decides.
 * Even there, GA loads only once a visitor accepts the cookie notice
 * (`app/google-analytics.tsx`).
 *
 * `RESOURCES_PREVIEW` (server-only, `1` or `true`) shows Resources pages and
 * changelog entries before their `publishOn` date (plan KTD-2), so a preview
 * deployment can be checked before the day. It is ignored on a production
 * deployment (`VERCEL_ENV=production`), whatever it is set to
 * (`lib/resources-context.ts`).
 *
 * `SAROH_BUILT_ROUTES` is not set by anyone: `next.config.js` writes the
 * build's page routes into it (`routes.config.js`), so the Resources list links
 * only pages this build has.
 */
export const env = createEnv({
    client: {
        NEXT_PUBLIC_ACCOUNTS_URL: z.string().url().optional(),
        NEXT_PUBLIC_LAUNCH_MODE: z.enum(["waitlist", "open"]).optional(),
        NEXT_PUBLIC_GA_MEASUREMENT_ID: z
            .string()
            .regex(/^G-[A-Z0-9]+$/)
            .optional(),
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
    server: {
        API_URL: z.string().url().optional(),
        SITE_RELAY_SECRET: z.string().min(32).optional(),
        PRICING_REVALIDATE_SECRET: z.string().min(32).optional(),
        /** Set by Next itself: "phase-production-build" while building. */
        NEXT_PHASE: z.string().optional(),
        VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
        RESOURCES_PREVIEW: z.string().optional(),
        SAROH_BUILT_ROUTES: z.string().optional(),
    },
    shared: {
        NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    },
    runtimeEnv: {
        API_URL: process.env.API_URL,
        SITE_RELAY_SECRET: process.env.SITE_RELAY_SECRET,
        PRICING_REVALIDATE_SECRET: process.env.PRICING_REVALIDATE_SECRET,
        NEXT_PHASE: process.env.NEXT_PHASE,
        VERCEL_ENV: process.env.VERCEL_ENV,
        RESOURCES_PREVIEW: process.env.RESOURCES_PREVIEW,
        SAROH_BUILT_ROUTES: process.env.SAROH_BUILT_ROUTES,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_ACCOUNTS_URL: process.env.NEXT_PUBLIC_ACCOUNTS_URL,
        NEXT_PUBLIC_LAUNCH_MODE: process.env.NEXT_PUBLIC_LAUNCH_MODE,
        NEXT_PUBLIC_GA_MEASUREMENT_ID:
            process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
