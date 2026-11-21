import type { ShopListingCard } from "@saroh/site-blocks";
import { productCardsOf } from "@saroh/site-blocks";

import type { EmbedService } from "@/components/post-embeds";
import { embedsIn, fillPostEmbeds } from "@/components/post-embeds";

import { getBookingPage } from "./booking-page";
import { shopFetch } from "./catalogue";
import {
    dontCachePage,
    listsProducts,
    showsServicesOffered,
} from "./page-cache/site-rules";

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
    const ids = embedsIn(html);
    if (ids.service.length === 0 && ids.product.length === 0) return html;
    const [services, products] = await Promise.all([
        ids.service.length ? readServices(siteId) : new Map(),
        ids.product.length
            ? readProducts(siteId, ids.product.slice(0, MAX_PRODUCT_CARDS))
            : new Map(),
    ]);
    return fillPostEmbeds(html, { services, products });
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
