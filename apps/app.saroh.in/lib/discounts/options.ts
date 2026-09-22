import type { ReachOptions } from "@/components/stores/discount-form";
import { listCategories, listProducts } from "@/lib/products/service";
import { listBusinessStores } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What a code can be pointed at: every storefront, and each storefront's
 * collections and products — grouped by storefront when there is more than
 * one, because two storefronts can both have a "Bread" collection.
 * Server-only. A storefront whose lists cannot be read offers nothing
 * rather than failing the form.
 */
export async function loadReachOptions(): Promise<{
    options: ReachOptions;
    defaultCurrency: string;
}> {
    const stores = await listBusinessStores();
    const many = stores.length > 1;
    const [categories, products, first] = await Promise.all([
        Promise.all(stores.map((s) => listCategories(s.id).catch(() => []))),
        Promise.all(stores.map((s) => listProducts(s.id).catch(() => []))),
        stores[0]
            ? getStorefront(stores[0].id).catch(() => null)
            : Promise.resolve(null),
    ]);
    const group = (i: number) => (many ? stores[i]?.name : undefined);
    return {
        options: {
            STOREFRONT: stores.map((s) => ({ id: s.id, label: s.name })),
            COLLECTION: categories.flatMap((list, i) =>
                list.map((c) => ({ id: c.id, label: c.name, group: group(i) })),
            ),
            PRODUCT: products.flatMap((list, i) =>
                list.map((p) => ({ id: p.id, label: p.name, group: group(i) })),
            ),
        },
        defaultCurrency: first?.currency ?? "INR",
    };
}
