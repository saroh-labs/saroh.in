import type { ProductListItem, ProductStatus } from "./service";

/** One place a catalogue row is sold, and what it looks like there. */
export interface CataloguePlace {
    storeId: string;
    storeName: string;
    product: ProductListItem;
}

/**
 * One row of the business's catalogue.
 *
 * Products are stored per storefront today, but the catalogue belongs to the
 * business (the "Saroh Products Screen" design, after Square's single item
 * library): the same SKU sold in two storefronts is ONE product, carrying the
 * places that sell it. Where the price differs between them the row says
 * "varies" rather than picking a winner. A product with no SKU cannot be
 * matched to anything, so it stays its own row.
 */
export interface CatalogueRow {
    key: string;
    name: string;
    sku: string | null;
    variantCount: number;
    status: ProductStatus;
    price: string;
    currency: string;
    /** The price differs between the places that sell it. */
    varies: boolean;
    /** Summed across places that track stock; `null` when none do. */
    stock: number | null;
    /** The tightest low-stock threshold among those places. */
    lowStockAlert: number | null;
    updatedAt: string;
    /** In a collection (a category) in at least one place. */
    inCollection: boolean;
    places: CataloguePlace[];
}

/** A row always has at least one place. */
type Places = [CataloguePlace, ...CataloguePlace[]];

export function mergeCatalogue(
    stores: { id: string; name: string }[],
    productsByStore: Record<string, ProductListItem[]>,
): CatalogueRow[] {
    const groups = new Map<string, Places>();
    for (const store of stores) {
        for (const product of productsByStore[store.id] ?? []) {
            const key = product.sku ?? `${store.id}:${product.id}`;
            const place = { storeId: store.id, storeName: store.name, product };
            const seen = groups.get(key);
            if (seen) seen.push(place);
            else groups.set(key, [place]);
        }
    }
    return Array.from(groups.entries(), ([key, places]) => toRow(key, places));
}

/** The same row seen from one storefront: its own price, stock and status. */
export function inStorefront(
    row: CatalogueRow,
    storeId: string,
): CatalogueRow | null {
    const here = row.places.filter((p) => p.storeId === storeId);
    const first = here.at(0);
    if (!first) return null;
    const rest = here.slice(1);
    // "Sold at" and "varies" stay facts about the product, not the filter.
    return {
        ...toRow(row.key, [first, ...rest]),
        places: row.places,
        varies: row.varies,
    };
}

function toRow(key: string, places: Places): CatalogueRow {
    const first = places[0].product;
    const tracked = places.filter((p) => p.product.inventory);
    const published = places.some((p) => p.product.status === "PUBLISHED");
    const allArchived = places.every((p) => p.product.status === "ARCHIVED");
    return {
        key,
        name: first.name,
        sku: first.sku,
        variantCount: Math.max(...places.map((p) => p.product.variantCount)),
        // Live anywhere is live; archived only when archived everywhere.
        status: published ? "PUBLISHED" : allArchived ? "ARCHIVED" : "DRAFT",
        price: first.price,
        currency: first.currency,
        varies: places.some((p) => p.product.price !== first.price),
        stock: tracked.length
            ? tracked.reduce(
                  (n, p) => n + (p.product.inventory?.quantity ?? 0),
                  0,
              )
            : null,
        lowStockAlert: tracked.length
            ? Math.min(
                  ...tracked.map(
                      (p) => p.product.inventory?.lowStockAlert ?? 0,
                  ),
              )
            : null,
        updatedAt: places.reduce(
            (latest, p) =>
                p.product.updatedAt > latest ? p.product.updatedAt : latest,
            first.updatedAt,
        ),
        inCollection: places.some((p) => p.product.categoryId !== null),
        places,
    };
}
