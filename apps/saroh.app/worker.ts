/**
 * The merchant-site Worker's entry (wrangler.jsonc `main`): OpenNext's
 * handler behind the page cache (#863, `lib/page-cache/worker.ts`), and both
 * behind the crash page (`withCrashPage`, `@saroh/ui/lib/crash-page`): if
 * either throws before Next renders, the visitor gets a plain, unbranded
 * "This page isn't loading" (a merchant's site never shows Saroh's brand)
 * instead of Cloudflare's own error screen.
 *
 * `.open-next/worker.js` exists only after `pnpm cf:build`, and wrangler
 * bundles this file after it; so this file is left out of `tsc` (tsconfig
 * `exclude`) and everything it does lives in `lib/page-cache/`, which is
 * typed and tested.
 */
import { reportWorkerCrash } from "@saroh/error-tracking/server";
import { withCrashPage } from "@saroh/ui/lib/crash-page";

import handler from "./.open-next/worker.js";
import type { PageCacheEnv, WaitUntil } from "./lib/page-cache/worker";
import { withPageCache } from "./lib/page-cache/worker";

export { SitePageTags } from "./lib/page-cache/tag-store";

const PAGE_CACHE_NAME = "saroh-pages";

export default {
    fetch: withCrashPage(
        withPageCache<PageCacheEnv, WaitUntil>(
            (request, env, ctx) => handler.fetch(request, env, ctx),
            {
                openCache: () => caches.open(PAGE_CACHE_NAME),
                now: () => Date.now(),
                // One JSON line per event, for Workers Logs (observability):
                // a revalidation at INFO, every degraded path at WARN.
                log: (event, detail) => {
                    const line = JSON.stringify({ event, ...detail });
                    if (event === "page_cache_revalidated") console.log(line);
                    else console.warn(line);
                },
            },
        ),
        {
            // No home link: on a host whose Worker failed, home fails too.
            brand: "neutral",
            // With a key (DEC-123), the crash is reported from the Worker:
            // the site's host and the path as a route, nothing about the
            // visitor. The visitor's browser is never involved.
            report: (error, { request, env }) =>
                reportWorkerCrash(error, request, {
                    key: env.POSTHOG_KEY,
                    host: env.POSTHOG_HOST,
                    app: "sites",
                    vercelEnv: env.VERCEL_ENV,
                    siteHost: true,
                }),
        },
    ),
};
