import { headers } from "next/headers";
import { cache } from "react";

import type { PublicContact } from "@saroh/site-blocks";
import { NO_CONTACT, publicContactOf } from "@saroh/site-blocks";

import { serverApiUrl } from "./api-url";
import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

const API_URL = serverApiUrl();

/**
 * How to reach the site's business (DEC-128): its public phone, contact
 * email, where customers come and its social links, for the footer on
 * every page and the home page's structured data.
 *
 *   GET /public/sites/:siteId/contact
 *
 * Read live, never cached here: what Settings saves shows without a
 * publish, as the phone always did (the API tells the page cache when one
 * changes). Signed for the visitor as the visit read is (ADR-011). `cache`
 * shares one read between the layout and the page within a request.
 *
 * Never takes the page down: anything but a good answer draws no contact
 * group, rather than a stale or a guessed one.
 */
export const getSiteContact = cache(async function siteContactFor(
    siteId: string,
): Promise<PublicContact> {
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
            `${API_URL}/public/sites/${encodeURIComponent(siteId)}/contact`,
            { cache: "no-store", headers: sent },
        );
        if (!res.ok) return NO_CONTACT;
        return (
            publicContactOf(await res.json().catch(() => null)) ?? NO_CONTACT
        );
    } catch {
        return NO_CONTACT;
    }
});
