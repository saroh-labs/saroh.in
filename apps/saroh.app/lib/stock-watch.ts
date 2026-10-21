import { headers } from "next/headers";

import type { WatchView } from "@saroh/site-blocks";
import { isWatchView } from "@saroh/site-blocks";

import { serverApiUrl } from "./api-url";
import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

export type StockWatchLookup =
    | { ok: true; view: WatchView }
    | { ok: false; reason: "missing" | "unavailable" };

/**
 * A "Stop waiting" link (DEC-174, automatic notices U24, #1155), read for
 * the site it is opened on:
 *
 *   GET /public/sites/:siteId/stock-watch/:token
 *
 * Never cached: the watch is told or stopped at any moment. The call
 * carries the signed relay (ADR-011) so the API's per-visitor limit counts
 * the visitor, not this server; with no secret to sign with it goes
 * unsigned. A 404 is a token that isn't this business's, or isn't one at
 * all; anything else going wrong is "unavailable", which the page says in
 * words.
 */
export async function getStockWatch(
    siteId: string,
    token: string,
): Promise<StockWatchLookup> {
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
            `${serverApiUrl()}/public/sites/${encodeURIComponent(siteId)}/stock-watch/${encodeURIComponent(token)}`,
            { cache: "no-store", headers: sent },
        );
        if (res.status === 404) return { ok: false, reason: "missing" };
        if (!res.ok) return { ok: false, reason: "unavailable" };
        const body: unknown = await res.json().catch(() => null);
        // Narrowed, not cast (#264).
        return isWatchView(body)
            ? { ok: true, view: body }
            : { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
