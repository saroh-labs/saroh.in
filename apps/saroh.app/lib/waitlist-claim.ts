import { headers } from "next/headers";

import type { WaitlistClaim } from "@saroh/site-blocks";
import { isWaitlistClaim } from "@saroh/site-blocks";

import { serverApiUrl } from "./api-url";
import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

export type WaitlistClaimLookup =
    | { ok: true; claim: WaitlistClaim }
    | { ok: false; reason: "missing" | "unavailable" };

/**
 * A waitlist offer's claim link (automatic notices U18, #1149), read for
 * the site it is opened on:
 *
 *   GET /public/sites/:siteId/waitlist-claim/:token
 *
 * Never cached: the offer ends, is booked or is taken by the minute. The
 * call carries the signed relay (ADR-011) so the API's per-visitor limit
 * counts the visitor, not this server; with no secret to sign with it goes
 * unsigned. A 404 is a link that isn't this business's, or isn't one at
 * all; anything else going wrong is "unavailable", which the page says in
 * words.
 */
export async function getWaitlistClaim(
    siteId: string,
    token: string,
): Promise<WaitlistClaimLookup> {
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
            `${serverApiUrl()}/public/sites/${encodeURIComponent(siteId)}/waitlist-claim/${encodeURIComponent(token)}`,
            { cache: "no-store", headers: sent },
        );
        if (res.status === 404) return { ok: false, reason: "missing" };
        if (!res.ok) return { ok: false, reason: "unavailable" };
        const body: unknown = await res.json().catch(() => null);
        // Narrowed, not cast (#264).
        return isWaitlistClaim(body)
            ? { ok: true, claim: body }
            : { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
