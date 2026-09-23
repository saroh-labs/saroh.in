import { resolveActiveOrganization } from "@/lib/organizations/service";
import { canWriteProducts } from "@/lib/products/access";
import { listCategories, listOptions } from "@/lib/products/service";
import {
    getEffectiveDefaults,
    getSkuSettings,
    listAllergens,
} from "@/lib/products/settings";
import { DEFAULT_SKU_PATTERN } from "@/lib/products/sku-pattern";
import { productCategoriesHref } from "@/lib/stores/links";
import type { Store } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What the product editor needs about the storefront a product is sold at:
 * its name and currency, its categories and options, and whether this
 * person may change products. The currency falls back to INR only when the
 * storefront's settings cannot be read — the editor still works. Options
 * that cannot be read leave Variants with none to offer, which it says.
 * Defaults (Settings → Defaults) that cannot be read leave the built-in
 * starting values.
 */
export async function loadEditorContext(
    store: Store,
    product?: { id: string; categoryId: string | null },
) {
    const [
        settings,
        categories,
        options,
        organization,
        sku,
        allergens,
        defaults,
    ] = await Promise.all([
        getStorefront(store.id).catch(() => null),
        listCategories(store.id),
        listOptions(store.id).catch(() => []),
        resolveActiveOrganization(),
        getSkuSettings(store.id, product?.id).catch(() => null),
        listAllergens(store.id).catch(() => null),
        getEffectiveDefaults(store.id, product?.categoryId ?? null).catch(
            () => null,
        ),
    ]);
    return {
        storeId: store.id,
        storeName: store.name,
        currency: settings?.currency ?? "INR",
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        categoriesHref: productCategoriesHref(store.id),
        options,
        canWrite: canWriteProducts(organization),
        sku: sku ?? { pattern: DEFAULT_SKU_PATTERN, suggest: true, n: 1 },
        allergens: (allergens ?? []).map((a) => ({ id: a.id, name: a.name })),
        defaults,
    };
}
