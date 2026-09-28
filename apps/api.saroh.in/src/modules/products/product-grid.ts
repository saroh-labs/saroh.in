import { BadRequestException } from "@nestjs/common";
import { PRODUCT_GRID_DEFAULT_COUNT, PRODUCT_GRID_MAX } from "@saroh/database";

/**
 * What a site's Product grid asks the public catalogue for (round-2 G12):
 * `GET public/sites/:siteId/shop/products?source=…`. Pure: no Nest DI, no
 * Prisma, so the rules are testable without a database.
 *
 * - `newest` — the newest products sold at the site's storefront.
 * - `collection` — the products of one collection (DEC-031), hand-picked
 *   in their order, automatic by name.
 * - `picked` — these products, in this order.
 *
 * With no `source` the read is `/shop`'s: everything sold there.
 */

export type GridSource = "newest" | "collection" | "picked";

export interface GridQuery {
    source: GridSource;
    /** `collection` only; null when the block has none chosen yet. */
    collectionId: string | null;
    /** `picked` only, in the merchant's order. */
    productIds: string[];
    count: number;
}

/** The query string as Nest hands it: a repeated key arrives as an array. */
export interface RawGridQuery {
    source?: unknown;
    collection?: unknown;
    ids?: unknown;
    count?: unknown;
}

const SOURCES: readonly GridSource[] = ["newest", "collection", "picked"];

/** An id as the database mints them: letters, digits, `_` and `-`. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function one(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    // `?count=4&count=8` is a caller's mistake, not a question.
    if (Array.isArray(value)) throw bad("Ask for one of each.");
    return undefined;
}

function bad(message: string): BadRequestException {
    return new BadRequestException(message);
}

/**
 * The grid's question, or null when none was asked (the whole shop). A
 * malformed one is a 400: the site's own renderer never sends one.
 */
export function parseGridQuery(raw: RawGridQuery): GridQuery | null {
    const source = one(raw.source);
    if (source === undefined) {
        if (
            raw.collection !== undefined ||
            raw.ids !== undefined ||
            raw.count !== undefined
        ) {
            throw bad("Say which products: newest, a collection or picked.");
        }
        return null;
    }
    if (!SOURCES.includes(source as GridSource)) {
        throw bad("Say which products: newest, a collection or picked.");
    }

    const countText = one(raw.count);
    let count = PRODUCT_GRID_DEFAULT_COUNT;
    if (countText !== undefined) {
        if (!/^\d{1,2}$/.test(countText)) throw bad("Ask for 1 to 12.");
        count = Number(countText);
        if (count < 1 || count > PRODUCT_GRID_MAX) {
            throw bad("Ask for 1 to 12.");
        }
    }

    const collection = one(raw.collection);
    if (collection !== undefined && !ID.test(collection)) {
        throw bad("That isn't a collection.");
    }

    const idsText = one(raw.ids);
    const productIds =
        idsText === undefined || idsText === ""
            ? []
            : [...new Set(idsText.split(","))];
    if (productIds.length > PRODUCT_GRID_MAX) {
        throw bad("Pick at most 12 products.");
    }
    if (productIds.some((id) => !ID.test(id))) {
        throw bad("That isn't a product.");
    }

    return {
        source: source as GridSource,
        collectionId: source === "collection" ? (collection ?? null) : null,
        productIds: source === "picked" ? productIds : [],
        count,
    };
}

/**
 * The listings in the order the grid asks for them, at most `count`: each
 * id in `order` finds its listing, and an id with none (archived, a draft,
 * unlisted, another business's) is skipped, so the next one moves up.
 */
export function inGridOrder<T extends { product: { id: string } }>(
    order: readonly string[],
    listings: readonly T[],
    count: number,
): T[] {
    const byProduct = new Map(listings.map((l) => [l.product.id, l]));
    const out: T[] = [];
    for (const id of order) {
        const listing = byProduct.get(id);
        if (!listing || out.includes(listing)) continue;
        out.push(listing);
        if (out.length === count) break;
    }
    return out;
}
