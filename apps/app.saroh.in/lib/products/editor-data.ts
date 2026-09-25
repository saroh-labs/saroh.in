import { unstable_rethrow } from "next/navigation";

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
        listCategories(),
        listOptions().catch(() => []),
        resolveActiveOrganization(),
        getSkuSettings(product?.id).catch(() => null),
        listAllergens().catch(() => null),
        getEffectiveDefaults(product?.categoryId ?? null).catch(
            (error: unknown) => {
                // A forbidden() or redirect from the read is the page's to
                // handle, not a failure to fall back from.
                unstable_rethrow(error);
                return null;
            },
        ),
    ]);
    return {
        storeId: store.id,
        storeName: store.name,
        currency: settings?.currency ?? "INR",
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        categoriesHref: productCategoriesHref(),
        options,
        canWrite: canWriteProducts(organization),
        sku: sku ?? { pattern: DEFAULT_SKU_PATTERN, suggest: true, n: 1 },
        allergens: (allergens ?? []).map((a) => ({ id: a.id, name: a.name })),
        defaults,
    };
}
