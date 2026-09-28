import { headers } from "next/headers";
import { cache } from "react";

import { env } from "@/env";

import type {
    Catalogue,
    CatalogueLookup,
    CatalogueProduct,
} from "./catalogue-shape";
import { isCatalogue, isCatalogueProduct, lookupOf } from "./catalogue-shape";
import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

export type {
    Catalogue,
    CatalogueLookup,
    CatalogueProduct,
} from "./catalogue-shape";

/**
 * The shop's reads (round-2 G11), server to server, never cached: a product
 * that sells out must stop saying "In stock".
 *
 *   GET /public/sites/:siteId/shop/products
 *   GET /public/sites/:siteId/shop/products/:slug
 *
 * The API derives the business from the site and answers 404 whenever the
 * shop is not open there: the `SITE_SHOP` flag is off (it stays off until
 * the bag and checkout, G13, ship), Commerce is off, no storefront is
 * chosen, or nothing is sold. So `/shop` and its product pages 404 exactly
 * as they did before this route existed.
 *
 * Each call carries the signed relay (ADR-011) so the API's per-visitor
 * limit counts the visitor, not this server. Without a secret to sign with,
 * the call goes unsigned and the API counts this server instead — the page
 * still renders.
 */
const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

async function shopFetch(path: string): Promise<Response | null> {
    const requestHeaders = await headers();
    const sent: Record<string, string> = { accept: "application/json" };
    const host = servedHost(requestHeaders);
    try {
        const relay = host ? relayFor(requestHeaders, host) : null;
        if (relay) sent[SITE_RELAY_HEADER] = relay;
    } catch {
        // No SITE_RELAY_SECRET here: read unsigned rather than not at all.
    }
    try {
        return await fetch(`${API_URL}/public/sites/${path}`, {
            cache: "no-store",
            headers: sent,
        });
    } catch {
        return null;
    }
}

/**
 * Everything the site's storefront sells. `cache` shares one read within a
 * request: the header asks whether to offer "Order" and `/shop` then draws
 * the same list.
 */
export const getCatalogue = cache(async function getCatalogue(
    siteId: string,
): Promise<CatalogueLookup<Catalogue>> {
    const res = await shopFetch(`${encodeURIComponent(siteId)}/shop/products`);
    if (!res) return { ok: false, reason: "unavailable" };
    return lookupOf(res, isCatalogue);
});

/** One product sold at the site's storefront, by its address. */
export const getCatalogueProduct = cache(async function getCatalogueProduct(
    siteId: string,
    slug: string,
): Promise<CatalogueLookup<CatalogueProduct>> {
    const res = await shopFetch(
        `${encodeURIComponent(siteId)}/shop/products/${encodeURIComponent(slug)}`,
    );
    if (!res) return { ok: false, reason: "unavailable" };
    return lookupOf(res, isCatalogueProduct);
});
