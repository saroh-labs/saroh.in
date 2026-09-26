import type { CatalogueProduct } from "./service";

/** A catalogue product as the API reads it, for the list's tests. */
export function catalogueProduct(
    over: Partial<CatalogueProduct> & { id: string },
): CatalogueProduct {
    return {
        storeId: "market",
        name: "Sourdough loaf",
        slug: "sourdough",
        description: null,
        image: null,
        categoryId: null,
        price: "4.80",
        currency: "GBP",
        status: "PUBLISHED",
        updatedAt: "2026-09-18T07:10:00.000Z",
        variantCount: 2,
        sku: "SD-800",
        variants: [],
        inventory: { quantity: 72, promised: 0, lowStockAlert: 5 },
        listings: [
            {
                storeId: "market",
                storeName: "Market Street",
                inventory: { quantity: 42, promised: 0, lowStockAlert: 5 },
                variants: [],
            },
            {
                storeId: "online",
                storeName: "Online",
                inventory: { quantity: 30, promised: 0, lowStockAlert: 10 },
                variants: [],
            },
        ],
        ...over,
    };
}
