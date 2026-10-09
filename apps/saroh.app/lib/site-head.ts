import { headers } from "next/headers";
import { cache } from "react";

import { serverApiUrl } from "./api-url";
import { servedHost } from "./origin";
import { dontCachePage } from "./page-cache/record";
import type { SiteHead } from "./site-head-shape";
import { siteHeadOf } from "./site-head-shape";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

export { NO_HEAD } from "./site-head-shape";
export type { SiteHead, SiteHeadTracker } from "./site-head-shape";

const API_URL = serverApiUrl();

/**
 * A head that couldn't be read: no codes, no trackers, and a page that is
 * not kept by the page cache (#863), so a failed read isn't what every
 * visitor gets until the page's time is up.
 */
function unreadHead(): SiteHead {
    dontCachePage("head unavailable");
    return siteHeadOf(null);
}

/**
 * What every page of a live site carries in its head (DEC-108, #893): its
 * verification codes, and the merchant's own trackers while the plan
 * includes them.
 *
 *   GET /public/sites/:siteId/head
 *
 * Read on every render, never cached, so a code saved in the workspace is
 * on the site at once; a page that carries any of it is kept by the page
 * cache for a minute at most (#863, `lib/page-cache/site-rules.ts`). Shared by `generateMetadata` (the codes) and the layout
 * (the trackers) through `cache`, so a page asks once. Signed for the
 * visitor as the footer read is (ADR-011). Never takes the page down:
 * anything but a good answer is no codes and no trackers.
 */
export const getSiteHead = cache(async function siteHeadFor(
    siteId: string,
): Promise<SiteHead> {
    try {
        const requestHeaders = await headers();
        const sent: Record<string, string> = { accept: "application/json" };
        const host = servedHost(requestHeaders);
        try {
            const relay = host ? relayFor(requestHeaders, host) : null;
            if (relay) sent[SITE_RELAY_HEADER] = relay;
        } catch {
            // No SITE_RELAY_SECRET here: read unsigned rather than not at all.
        }
        const res = await fetch(
            `${API_URL}/public/sites/${encodeURIComponent(siteId)}/head`,
            { cache: "no-store", headers: sent },
        );
        if (!res.ok) return unreadHead();
        return siteHeadOf(await res.json().catch(() => null));
    } catch {
        return unreadHead();
    }
});
