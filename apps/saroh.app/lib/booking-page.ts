import { headers } from "next/headers";
import { cache } from "react";

import type { BookingPageData, PublicVisit } from "@saroh/site-blocks";
import { isBookingPage, isPublicVisit } from "@saroh/site-blocks";

import { env } from "@/env";

import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

export type BookingPageLookup =
    | { ok: true; page: BookingPageData }
    | { ok: false; reason: "missing" | "unavailable" };

/**
 * What a site's booking page opens with (U19): its business, the services it
 * offers, the rules. Read server-to-server when the page is rendered, never
 * cached — a service paused a minute ago must not be offered. A 404 is a site
 * with nothing published; anything else going wrong is "unavailable", which
 * the page says in words rather than as a 404.
 *
 * `cache` shares one read within ONE request, not across requests: the site
 * header asks whether to offer "Book" (G17) and `/book` then draws the same
 * page, so a visitor on `/book` costs one read, not two. The next request
 * reads again.
 */
export const getBookingPage = cache(async function getBookingPage(
    siteId: string,
): Promise<BookingPageLookup> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/sites/${encodeURIComponent(siteId)}/booking`,
            { cache: "no-store", headers: { accept: "application/json" } },
        );
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body: unknown = await res.json().catch(() => null);
    return isBookingPage(body)
        ? { ok: true, page: body }
        : { ok: false, reason: "unavailable" };
});

/**
 * The booking page header's facts (E6): the business's place, hours and
 * public phone, from G8's public visit read — the same read, and so the same
 * words, as the site's Visit us block.
 *
 *   GET /public/sites/:siteId/visit
 *
 * Read beside the booking page, never cached (a phone removed in Settings ›
 * Business stops showing at once). The call carries the signed relay
 * (ADR-011) so the API's per-visitor limit counts the visitor, not this
 * server; with no secret to sign with it goes unsigned, and the API counts
 * this server instead.
 *
 * Never takes the page down: anything but a good answer is null, and the
 * header then names the business only.
 */
export async function getBookingVisit(
    siteId: string,
): Promise<PublicVisit | null> {
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
            `${API_URL}/public/sites/${encodeURIComponent(siteId)}/visit`,
            { cache: "no-store", headers: sent },
        );
        if (!res.ok) return null;
        const body: unknown = await res.json().catch(() => null);
        // Narrowed, not cast (#264).
        return isPublicVisit(body) ? body : null;
    } catch {
        return null;
    }
}
