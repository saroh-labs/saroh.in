import {
    createVariant,
    deleteVariant,
    listProductAt,
    patchProduct,
    reorderVariants,
    unlistProductAt,
    updateVariant,
} from "@/lib/products/actions";
import type { ProductListingView } from "@/lib/products/listing-changes";
import {
    listedAt,
    listingChanges,
    soldAtFrom,
} from "@/lib/products/listing-changes";
import type { ProductDetail } from "@/lib/products/service";
import type { VariantRow } from "@/lib/products/variant-rows";
import { sameRows } from "@/lib/products/variant-rows";

/** A save that never reached the API, as opposed to one it refused. */
export const DROPPED =
    "Couldn't save variants — the connection dropped. The product itself is saved.";

/** What a save of the Variants list did. */
export interface VariantSave {
    /** The list as it now stands, with ids for the rows just made. */
    next: VariantRow[];
    /** What the server holds — the baseline for a retry after a failure. */
    saved: VariantRow[];
    /** The first refusal, or null when everything saved. */
    why: string | null;
    /** For the section's note; null when said as a toast instead. */
    failed: string | null;
    /** Said as a toast (a refused option change). */
    toast?: string;
}

/**
 * Save the Variants list (#468, #525), one call at a time: removals first,
 * then the option, then each new or changed row, the order, and — with more
 * than one storefront — where each variant is sold. The first refusal is
 * named; the rest still run, so a retry resends only what is still
 * different.
 */
export async function saveVariantList(input: {
    product: ProductDetail;
    storeId: string;
    rows: VariantRow[];
    base: VariantRow[];
    optionId: string;
    titleOf: (r: VariantRow) => string;
    listings: ProductListingView[] | null;
    /** The storefronts "Sell it at" offers; [] with one storefront. */
    sellAt: readonly { id: string }[];
}): Promise<VariantSave> {
    const { product, storeId, rows, base, optionId, titleOf, listings } = input;
    let why: string | null = null;
    let next = rows;
    let saved = base;
    const replace = (key: string, patch: Partial<VariantRow>) => {
        next = next.map((r) => (r.key === key ? { ...r, ...patch } : r));
    };
    try {
        // Removed first: a value or SKU freed by a removal can be taken by a
        // new row, and a product left with none can change option.
        const goneIds = base
            .map((b) => b.id)
            .filter(
                (id): id is string => !!id && !rows.some((r) => r.id === id),
            );
        for (const goneId of goneIds) {
            const res = await deleteVariant(product.id, goneId);
            if (res.ok) saved = saved.filter((b) => b.id !== goneId);
            else why ??= res.error;
        }
        // A refused removal says why; changing option would only be refused
        // next for the variant still there.
        if (why) return { next: rows, saved, why, failed: why };
        if (optionId !== (product.optionId ?? "")) {
            const res = await patchProduct(storeId, product.id, {
                optionId: optionId || null,
            });
            if (!res.ok)
                return {
                    next: rows,
                    saved,
                    why: res.error,
                    failed: null,
                    toast: res.error,
                };
        }
        for (const r of rows) {
            const body = {
                sku: r.sku.trim(),
                title: titleOf(r),
                price: r.price.trim() || null,
                mrp: r.mrp,
                image: r.image,
                optionValueId: r.valueId || null,
                imageId: r.imageId || null,
            };
            const was = base.find((b) => b.id && b.id === r.id);
            if (!r.id) {
                const res = await createVariant(product.id, body);
                if (!res.ok) {
                    why ??= res.error;
                    continue;
                }
                // Saved: a retry must update it, not make it twice. Sold,
                // for now, wherever the product is listed — the API adds a
                // new variant to every listing.
                replace(r.key, { id: res.data.id });
                saved = [
                    ...saved,
                    {
                        ...r,
                        id: res.data.id,
                        stores: listings ? listedAt(listings) : [],
                    },
                ];
            } else if (was && !sameRows([r], [{ ...was, stores: r.stores }])) {
                // Where it is sold is the listings' to save, below.
                const res = await updateVariant(product.id, r.id, body);
                if (res.ok)
                    saved = saved.map((b) =>
                        b.id === r.id ? { ...r, stores: b.stores } : b,
                    );
                else why ??= res.error;
            }
        }
        const ids = next.map((r) => r.id).filter((id): id is string => !!id);
        const savedOrder = base
            .map((b) => b.id)
            .filter((id): id is string => !!id);
        if (
            !why &&
            ids.length > 1 &&
            JSON.stringify(ids) !==
                JSON.stringify(savedOrder.filter((id) => ids.includes(id)))
        ) {
            const res = await reorderVariants(storeId, product.id, ids);
            if (!res.ok) why ??= res.error;
        }
        if (!why && listings && input.sellAt.length > 0) {
            why = await saveListings(
                product.id,
                listings,
                input.sellAt,
                ids,
                next,
            );
        }
    } catch {
        why ??= DROPPED;
    }
    return { next, saved, why, failed: why };
}

/** "Sell it at": one call per storefront that changes; the first refusal. */
async function saveListings(
    productId: string,
    read: ProductListingView[],
    stores: readonly { id: string }[],
    ids: string[],
    list: VariantRow[],
): Promise<string | null> {
    const wanted: Record<string, string[]> = {};
    for (const r of list) if (r.id) wanted[r.id] = r.stores;
    const changes = listingChanges({
        storeIds: stores.map((s) => s.id),
        listed: listedAt(read),
        order: ids,
        before: soldAtFrom(read),
        wanted,
    });
    let why: string | null = null;
    for (const c of changes) {
        const res =
            "unlist" in c
                ? await unlistProductAt(productId, c.storeId)
                : await listProductAt(productId, c.storeId, c.variantIds);
        if (!res.ok) why ??= res.error;
    }
    return why;
}
