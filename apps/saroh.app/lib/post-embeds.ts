import type { ShopListingCard } from "@saroh/site-blocks";
import { productCardsOf } from "@saroh/site-blocks";

import type { EmbedOffer, EmbedService } from "@/components/post-embeds";
import {
    embedsIn,
    fillContents,
    fillPostEmbeds,
} from "@/components/post-embeds";

import { serverApiUrl, serverReadSignal } from "./api-url";
import { getBookingPage } from "./booking-page";
import { shopFetch } from "./catalogue";
import {
    dontCachePage,
    listsProducts,
    showsServicesOffered,
} from "./page-cache/site-rules";

const API_URL = serverApiUrl();

/** The most product cards one post reads; past it, a card draws nothing. */
export const MAX_PRODUCT_CARDS = 6;

/**
 * A post's cards from the business (U15b), read when the page is rendered,
 * never copied into the post. Services come from the booking page's own read
 * (what is offered now, the same list `/book` draws); each product from the
 * shop's picked read, which serves only what is published and sold at the
 * site's storefront. A post with no cards reads nothing and is unchanged.
 */
export async function resolvePostEmbeds(
    html: string,
    siteId: string,
): Promise<string> {
    const withContents = fillContents(html);
    const ids = embedsIn(withContents);
    const services = [...ids.service, ...ids.book];
    if (services.length + ids.product.length + ids.offer.length === 0) {
        return withContents;
    }
    const [serviceMap, products, offers] = await Promise.all([
        services.length ? readServices(siteId) : new Map(),
        ids.product.length
            ? readProducts(siteId, ids.product.slice(0, MAX_PRODUCT_CARDS))
            : new Map(),
        ids.offer.length
            ? readOffers(siteId, ids.offer.slice(0, MAX_PRODUCT_CARDS))
            : new Map(),
    ]);
    return fillPostEmbeds(withContents, {
        services: serviceMap,
        products,
        offers,
    });
}

/**
 * Each offer's words (W2), from the site's public reads (not behind the Share switch): an ended offer is a
 * 404 and draws nothing. Read uncached, like the booking page, and the
 * page is kept no longer than an offer may run (`showsServicesOffered`).
 */
async function readOffers(
    siteId: string,
    offerIds: string[],
): Promise<Map<string, EmbedOffer> | null> {
    showsServicesOffered();
    const reads = await Promise.all(
        offerIds.map(async (id) => {
            try {
                const res = await fetch(
                    `${API_URL}/public/sites/${encodeURIComponent(siteId)}/offers/${encodeURIComponent(id)}`,
                    {
                        cache: "no-store",
                        headers: { accept: "application/json" },
                        signal: serverReadSignal(),
                    },
                );
                if (res.status === 404) return [id, null] as const;
                if (!res.ok) return undefined;
                const body = (await res.json()) as EmbedOffer;
                return typeof body.headline === "string"
                    ? ([id, body] as const)
                    : undefined;
            } catch {
                return undefined;
            }
        }),
    );
    if (reads.some((r) => r === undefined)) {
        dontCachePage("offer card unavailable");
        return null;
    }
    const out = new Map<string, EmbedOffer>();
    for (const r of reads) if (r?.[1]) out.set(r[0], r[1]);
    return out;
}

async function readServices(
    siteId: string,
): Promise<Map<string, EmbedService> | null> {
    // No service write revalidates a page: a price shows within this.
    showsServicesOffered();
    const read = await getBookingPage(siteId);
    if (!read.ok) {
        // Nothing offered (no booking page) is no cards; a failure isn't kept.
        if (read.reason === "missing") return new Map();
        dontCachePage("booking unavailable");
        return null;
    }
    return new Map(read.page.services.map((s) => [s.id, s]));
}

async function readProducts(
    siteId: string,
    productIds: string[],
): Promise<Map<string, ShopListingCard> | null> {
    // A price or stock change redraws the page (#863).
    listsProducts(siteId);
    // shortcut: one read per card, since a card carries no product id to
    // match a batch read's answer by; batch it if posts carry many products.
    const reads = await Promise.all(
        productIds.map(async (id) => {
            const res = await shopFetch(
                `${encodeURIComponent(siteId)}/shop/products?source=picked&ids=${encodeURIComponent(id)}&count=1`,
            );
            // The shop not open there: the card draws nothing.
            if (res?.status === 404) return [id, null] as const;
            const cards = res?.ok
                ? productCardsOf(await res.json().catch(() => null))
                : null;
            if (!cards) return undefined;
            return [id, cards[0] ?? null] as const;
        }),
    );
    if (reads.some((r) => r === undefined)) {
        dontCachePage("product card unavailable");
        return null;
    }
    const out = new Map<string, ShopListingCard>();
    for (const r of reads) if (r?.[1]) out.set(r[0], r[1]);
    return out;
}
