import type { ReachOptions } from "@/components/stores/discount-form";
import { listCategories, listProducts } from "@/lib/products/service";
import { listBusinessStores } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What a code can be pointed at: every storefront, the business's
 * categories (one list since #529), and the business's products — one each,
 * whatever storefronts sell them (#531). Server-only. A list that cannot be
 * read offers nothing rather than failing the form.
 */
export async function loadReachOptions(): Promise<{
    options: ReachOptions;
    defaultCurrency: string;
}> {
    const stores = await listBusinessStores();
    const [categories, products, first] = await Promise.all([
        listCategories().catch(() => []),
        listProducts().catch(() => []),
        stores[0]
            ? getStorefront(stores[0].id).catch(() => null)
            : Promise.resolve(null),
    ]);
    return {
        options: {
            STOREFRONT: stores.map((s) => ({ id: s.id, label: s.name })),
            COLLECTION: categories.map((c) => ({ id: c.id, label: c.name })),
            PRODUCT: products.map((p) => ({ id: p.id, label: p.name })),
        },
        defaultCurrency: first?.currency ?? "INR",
    };
}
