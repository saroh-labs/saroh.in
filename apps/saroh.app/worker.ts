/**
 * The merchant-site Worker's entry (wrangler.jsonc `main`): OpenNext's
 * handler behind the page cache (#863, `lib/page-cache/worker.ts`).
 *
 * `.open-next/worker.js` exists only after `pnpm cf:build`, and wrangler
 * bundles this file after it; so this file is left out of `tsc` (tsconfig
 * `exclude`) and everything it does lives in `lib/page-cache/`, which is
 * typed and tested.
 */
import handler from "./.open-next/worker.js";
import type { PageCacheEnv, WaitUntil } from "./lib/page-cache/worker";
import { withPageCache } from "./lib/page-cache/worker";

export { SitePageTags } from "./lib/page-cache/tag-store";

const PAGE_CACHE_NAME = "saroh-pages";

export default {
    fetch: withPageCache<PageCacheEnv, WaitUntil>(
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
};
