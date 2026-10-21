import type { Prisma } from "@saroh/database";

import { keptByCut } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { publicStock, shelfFor } from "../products/public-catalogue.serialize";
import {
    commerceOpen,
    effectiveStorefront,
    shopRolloutOn,
} from "../sites/sells-from";
import { businessTracksStock } from "./tracking";

/**
 * Whether a product, or one option of it, can be bought on a site now,
 * read the way the site's shop reads it (`public-catalogue.service.ts`):
 * the site's storefront, the product published and listed there (with the
 * option listed), not paused by a plan cut, and its line not Sold out
 * (`publicStock`: a counted shelf with nothing free, or an uncounted
 * product marked Sold out by hand). A whole product sells when any option
 * listed there does.
 *
 * One read for "Tell me" (offered only while it is sold out) and for the
 * `stock.back-in-stock` run (told only when it sells), so the two can't
 * disagree. Runs in the business's RLS context, on the caller's
 * transaction.
 */

type Tx = Prisma.TransactionClient;

/** What a site shows of a product it sells. */
export interface Watchable {
    sellable: boolean;
    productId: string;
    slug: string;
    name: string;
    /** The option's name ("Red / Large"); null for the whole product. */
    variantTitle: string | null;
}

/**
 * The product as the site shows it, or null when the site doesn't sell it
 * (no shop there, not listed, the option not offered, another business's).
 */
export async function readWatchable(
    tx: Tx,
    organizationId: string,
    input: { siteId: string; productId: string; variantId: string | null },
): Promise<Watchable | null> {
    const site = await tx.site.findFirst({
        where: {
            id: input.siteId,
            organizationId,
            deletedAt: null,
        },
        select: { organizationId: true, storefrontId: true },
    });
    if (!site) return null;
    if (!(await shopRolloutOn(organizationId))) return null;
    if (!(await commerceOpen(tx, organizationId))) return null;
    const storefront = await effectiveStorefront(tx, site);
    if (!storefront) return null;
    const paused = await overLimit.pausedNow(organizationId);
    const product = await tx.product.findFirst({
        where: {
            id: input.productId,
            organizationId,
            status: "PUBLISHED",
            // Its own clause: the cut may name ids, which must not replace
            // the product's own.
            AND: [keptByCut(paused?.products ?? null)],
        },
        select: {
            id: true,
            slug: true,
            name: true,
            stockTracked: true,
            variants: {
                orderBy: [{ position: "asc" }, { id: "asc" }],
                select: { id: true, title: true },
            },
            listings: {
                where: { storeId: storefront.id },
                select: {
                    soldOutAt: true,
                    variants: { select: { variantId: true } },
                },
            },
        },
    });
    const listing = product?.listings[0];
    if (!product || !listing) return null;
    const listed = new Set(listing.variants.map((v) => v.variantId));
    const offered = product.variants.filter((v) => listed.has(v.id));
    if (product.variants.length > 0 && offered.length === 0) return null;

    let variantTitle: string | null = null;
    let lines: (string | null)[];
    if (input.variantId) {
        const variant = offered.find((v) => v.id === input.variantId);
        if (!variant) return null;
        variantTitle = variant.title;
        lines = [variant.id];
    } else {
        lines = offered.length > 0 ? offered.map((v) => v.id) : [null];
    }

    const [rows, businessTracks] = await Promise.all([
        tx.stockLevel.findMany({
            where: {
                organizationId,
                storeId: storefront.id,
                productId: product.id,
            },
            select: {
                productId: true,
                variantId: true,
                onHand: true,
                promised: true,
                lowStockAlert: true,
            },
        }),
        businessTracksStock(tx, organizationId),
    ]);
    const tracked = product.stockTracked && businessTracks;
    const markedSoldOut = listing.soldOutAt !== null;
    const sellable = lines.some(
        (variantId) =>
            publicStock({
                tracked,
                markedSoldOut,
                row: shelfFor(rows, product.id, variantId),
            }).word !== "SOLD_OUT",
    );
    return {
        sellable,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        variantTitle,
    };
}
