import { listCategories } from "@/lib/products/service";
import type { Store } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What the product editor needs about the storefront a product is sold at:
 * its name, its currency, and its categories. The currency falls back to INR
 * only when the storefront's settings cannot be read — the editor still works,
 * and the note under Currency says which one the storefront charges in.
 */
export async function loadEditorContext(store: Store) {
    const [settings, categories] = await Promise.all([
        getStorefront(store.id).catch(() => null),
        listCategories(store.id),
    ]);
    return {
        storeId: store.id,
        storeName: store.name,
        storeCurrency: settings?.currency ?? "INR",
        categories,
        // Categories are still managed on the storefront's own screen.
        categoriesHref: `/stores/${store.id}/products/categories`,
    };
}
