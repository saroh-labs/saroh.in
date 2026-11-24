import type { QueryClient } from "@tanstack/react-query";

import type { ProductOverview } from "@/lib/products/overview-rules";
import type { DomainKey } from "@/lib/query/keys";

import type { ProductRead } from "./queries";
import { productKeys, productsListKeys } from "./queries";
import type { CataloguePage, CatalogueProduct, ProductStatus } from "./service";

/**
 * Products' quick edits in the cache (DEC-259; owner, 23 Nov: archive or
 * publish, add stock, price are optimistic). Pure patches, and the moves
 * that write one into every cached list page and the product's own reads,
 * each returning the undo that puts back exactly what it replaced.
 */
export interface QuickPatch {
    status?: ProductStatus;
    /** A product with no sizes: its price. */
    price?: string;
    /** Units just received at one storefront. */
    stockAdd?: { storeId: string; units: number };
}

function stockAdded<T extends { quantity: number } | null>(
    inv: T,
    units: number,
): T {
    return inv ? { ...inv, quantity: inv.quantity + units } : inv;
}

function patchRow(
    p: CatalogueProduct,
    patch: QuickPatch,
    id: string,
): CatalogueProduct {
    if (p.id !== id) return p;
    const add = patch.stockAdd;
    return {
        ...p,
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.price ? { price: patch.price } : {}),
        ...(add
            ? {
                  // The row's own count: summed across storefronts, or the
                  // one in view, and the storefront's listing beside it.
                  inventory: stockAdded(p.inventory, add.units),
                  listings: p.listings.map((l) =>
                      l.storeId === add.storeId
                          ? {
                                ...l,
                                inventory: stockAdded(l.inventory, add.units),
                            }
                          : l,
                  ),
              }
            : {}),
    };
}

/** The list page with one product's quick edit applied. */
export function patchPage(
    page: CataloguePage,
    id: string,
    patch: QuickPatch,
): CataloguePage {
    return {
        ...page,
        items: page.items.map((p) => patchRow(p, patch, id)),
    };
}

/** The list page with one quick edit applied to several products. */
export function patchPageMany(
    page: CataloguePage,
    ids: readonly string[],
    patch: QuickPatch,
): CataloguePage {
    return ids.reduce((p, id) => patchPage(p, id, patch), page);
}

/** The product page's overview with a quick edit applied. */
export function patchOverview(
    o: ProductOverview,
    patch: QuickPatch,
): ProductOverview {
    const add = patch.stockAdd;
    return {
        ...o,
        product: {
            ...o.product,
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.price ? { price: patch.price } : {}),
        },
        price: patch.price
            ? { ...o.price, min: patch.price, max: patch.price }
            : o.price,
        stock:
            add && o.stock.mode === "product" && o.stock.product
                ? {
                      ...o.stock,
                      product: {
                          ...o.stock.product,
                          onHand: o.stock.product.onHand + add.units,
                          canSell: o.stock.product.canSell + add.units,
                      },
                      totals: {
                          ...o.stock.totals,
                          onHand: o.stock.totals.onHand + add.units,
                          canSell: o.stock.totals.canSell + add.units,
                      },
                  }
                : o.stock,
    };
}

/** The product page's read with a quick edit applied. */
function patchRead(read: ProductRead, patch: QuickPatch): ProductRead {
    return { ...read, overview: patchOverview(read.overview, patch) };
}

type Undo = () => void;

/** Every cached query under `key` changed by `change`; the undo restores them. */
function applyTo<T>(
    qc: QueryClient,
    key: DomainKey,
    change: (data: T) => T,
): Undo {
    const before = qc.getQueriesData<T>({ queryKey: key });
    for (const [k, data] of before) {
        if (data) qc.setQueryData(k, change(data));
    }
    return () => {
        for (const [k, data] of before) qc.setQueryData(k, data);
    };
}

/**
 * One quick edit on several products (one, or a bulk Archive), at once: in
 * every cached page of the list and on each product's page.
 */
export function applyQuick(
    qc: QueryClient,
    orgId: string,
    ids: readonly string[],
    patch: QuickPatch,
): Undo {
    const undo = [
        applyTo<CataloguePage>(qc, productsListKeys(orgId), (p) =>
            patchPageMany(p, ids, patch),
        ),
        ...ids.map((id) =>
            applyTo<ProductRead>(qc, productKeys(orgId, id), (r) =>
                patchRead(r, patch),
            ),
        ),
    ];
    return () => {
        for (const u of undo.reverse()) u();
    };
}
