import type { CatalogueProduct, ProductStatus } from "./service";

/** One storefront that sells a catalogue row, and its stock there. */
export interface CataloguePlace {
    storeId: string;
    storeName: string;
    inventory: { quantity: number; lowStockAlert: number } | null;
}

/**
 * One row of the business's catalogue.
 *
 * The catalogue belongs to the business (#531, the "Saroh Products Screen"
 * design, after Square's single item library): the API returns one product
 * per row, with each storefront that sells it — its listings — and the
 * stock on each shelf. Nothing is matched or merged here.
 */
export interface CatalogueRow {
    /** The product's id: one row per catalogue product. */
    key: string;
    id: string;
    name: string;
    sku: string | null;
    variantCount: number;
    status: ProductStatus;
    price: string;
    currency: string;
    /** Summed across places that track stock; `null` when none do. */
    stock: number | null;
    /** The tightest low-stock threshold among those places. */
    lowStockAlert: number | null;
    updatedAt: string;
    /** In a collection (a category). */
    inCollection: boolean;
    /** Where it is sold; empty when no storefront sells it just now. */
    places: CataloguePlace[];
}

export function catalogueRows(
    products: readonly CatalogueProduct[],
): CatalogueRow[] {
    return products.map((p) => ({
        key: p.id,
        id: p.id,
        name: p.name,
        sku: p.sku,
        variantCount: p.variantCount,
        status: p.status,
        price: p.price,
        currency: p.currency,
        ...stockOf(p.listings),
        updatedAt: p.updatedAt,
        inCollection: p.categoryId !== null,
        places: p.listings,
    }));
}

/**
 * The same row as one storefront sees it: its stock there. `null` when that
 * storefront does not sell it — the storefront filter filters by listing.
 */
export function inStorefront(
    row: CatalogueRow,
    storeId: string,
): CatalogueRow | null {
    const here = row.places.filter((p) => p.storeId === storeId);
    if (here.length === 0) return null;
    // "Sold at" stays a fact about the product, not the filter.
    return { ...row, ...stockOf(here) };
}

function stockOf(places: readonly CataloguePlace[]): {
    stock: number | null;
    lowStockAlert: number | null;
} {
    const tracked = places.flatMap((p) => (p.inventory ? [p.inventory] : []));
    if (tracked.length === 0) return { stock: null, lowStockAlert: null };
    return {
        stock: tracked.reduce((n, i) => n + i.quantity, 0),
        lowStockAlert: Math.min(...tracked.map((i) => i.lowStockAlert)),
    };
}
