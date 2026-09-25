import type { ReachOptions } from "@/components/stores/discount-form";
import { listCategories, listProducts } from "@/lib/products/service";
import { listBusinessStores } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What a code can be pointed at: every storefront, the business's
 * categories (one list since #529), and each storefront's products — grouped
 * by storefront when there is more than one, because two storefronts can
 * both sell a "Sourdough". Server-only. A list that cannot be read offers
 * nothing rather than failing the form.
 */
export async function loadReachOptions(): Promise<{
    options: ReachOptions;
    defaultCurrency: string;
}> {
    const stores = await listBusinessStores();
    const many = stores.length > 1;
    const [categories, products, first] = await Promise.all([
        listCategories().catch(() => []),
        Promise.all(stores.map((s) => listProducts(s.id).catch(() => []))),
        stores[0]
            ? getStorefront(stores[0].id).catch(() => null)
            : Promise.resolve(null),
    ]);
    const group = (i: number) => (many ? stores[i]?.name : undefined);
    return {
        options: {
            STOREFRONT: stores.map((s) => ({ id: s.id, label: s.name })),
            COLLECTION: categories.map((c) => ({ id: c.id, label: c.name })),
            PRODUCT: products.flatMap((list, i) =>
                list.map((p) => ({ id: p.id, label: p.name, group: group(i) })),
            ),
        },
        defaultCurrency: first?.currency ?? "INR",
    };
}
