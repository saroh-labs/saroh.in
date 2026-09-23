import { resolveActiveOrganization } from "@/lib/organizations/service";
import { canWriteProducts } from "@/lib/products/access";
import { listCategories, listOptions } from "@/lib/products/service";
import { productCategoriesHref } from "@/lib/stores/links";
import type { Store } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What the product editor needs about the storefront a product is sold at:
 * its name and currency, its categories and options, and whether this
 * person may change products. The currency falls back to INR only when the
 * storefront's settings cannot be read — the editor still works. Options
 * that cannot be read leave Variants with none to offer, which it says.
 */
export async function loadEditorContext(store: Store) {
    const [settings, categories, options, organization] = await Promise.all([
        getStorefront(store.id).catch(() => null),
        listCategories(store.id),
        listOptions(store.id).catch(() => []),
        resolveActiveOrganization(),
    ]);
    return {
        storeId: store.id,
        storeName: store.name,
        currency: settings?.currency ?? "INR",
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        categoriesHref: productCategoriesHref(store.id),
        options,
        canWrite: canWriteProducts(organization),
    };
}
