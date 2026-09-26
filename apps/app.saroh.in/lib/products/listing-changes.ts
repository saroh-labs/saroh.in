/**
 * "Sell it at" (#525): which storefronts sell each variant, as the Editor's
 * Variants section stages it, and the listing calls that make it so. Pure
 * and client-safe; tested in `listing-changes.test.ts`.
 *
 * A storefront sells a product through its listing, and the listing names
 * the variants sold there (#510). A new variant joins every listing the
 * product has (the API does that when it is made), so its "before" is every
 * storefront the product is listed at.
 */

/** One storefront's listing of the product, as the API reads it. */
export interface ProductListingView {
    storeId: string;
    storeName: string;
    listed: boolean;
    variants: { variantId: string; soldHere: boolean }[];
}

/** Variant id → the storefronts that sell it. */
export type SoldAt = Partial<Record<string, string[]>>;

/** Where each saved variant is sold now. */
export function soldAtFrom(listings: readonly ProductListingView[]): SoldAt {
    const out: Record<string, string[]> = {};
    for (const l of listings) {
        if (!l.listed) continue;
        for (const v of l.variants) {
            if (!v.soldHere) continue;
            (out[v.variantId] ??= []).push(l.storeId);
        }
    }
    return out;
}

/** The storefronts the product is listed at. */
export function listedAt(listings: readonly ProductListingView[]): string[] {
    return listings.filter((l) => l.listed).map((l) => l.storeId);
}

/**
 * Where a variant added in the editor starts: every storefront the product
 * is listed at, or every storefront when it is listed nowhere yet.
 */
export function newVariantStores(
    listings: readonly ProductListingView[],
): string[] {
    const listed = listedAt(listings);
    return listed.length > 0 ? listed : listings.map((l) => l.storeId);
}

/** One call: list it at a storefront selling these variants, or unlist it. */
export type ListingChange =
    | { storeId: string; variantIds: string[] }
    | { storeId: string; unlist: true };

/**
 * The calls that take the listings from `before` to `wanted`, one per
 * storefront that changes. A storefront left selling none of the variants
 * stops selling the product; its shelf and stock stay (#510).
 *
 * `order` is the variants in the list's order, saved ids only; a variant
 * missing from `before` was just made, so it is sold wherever the product
 * is listed.
 */
export function listingChanges(input: {
    storeIds: readonly string[];
    listed: readonly string[];
    order: readonly string[];
    before: SoldAt;
    wanted: SoldAt;
}): ListingChange[] {
    const { storeIds, listed, order, before, wanted } = input;
    const was = (id: string) => before[id] ?? [...listed];
    const out: ListingChange[] = [];
    for (const storeId of storeIds) {
        const now = order.filter((id) => was(id).includes(storeId));
        const next = order.filter((id) =>
            (wanted[id] ?? was(id)).includes(storeId),
        );
        const same =
            now.length === next.length && now.every((id) => next.includes(id));
        if (same) continue;
        if (next.length === 0) {
            if (listed.includes(storeId)) out.push({ storeId, unlist: true });
            continue;
        }
        out.push({ storeId, variantIds: next });
    }
    return out;
}

/**
 * The summary beside a variant's More: "Hill Road, Online", or that it is
 * sold nowhere. Names follow the storefronts' order.
 */
export function soldAtSummary(
    stores: readonly { id: string; name: string }[],
    chosen: readonly string[],
): string {
    const names = stores
        .filter((s) => chosen.includes(s.id))
        .map((s) => s.name);
    return names.length > 0 ? names.join(", ") : "not sold anywhere";
}
