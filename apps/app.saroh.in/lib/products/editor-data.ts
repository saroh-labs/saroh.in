import { unstable_rethrow } from "next/navigation";

import { variantCapOf } from "@/lib/billing/variant-cap";
import { readMissingRates } from "@/lib/gst-rates/service";
import { businessModeOf } from "@/lib/gst/price-mode";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readOrganizationSettings } from "@/lib/organizations/settings-service";
import { canStockProducts, canWriteProducts } from "@/lib/products/access";
import { roleName } from "@/lib/products/editor-labels";
import { getProductListings } from "@/lib/products/listings";
import { listCategories, listOptions } from "@/lib/products/service";
import {
    getEffectiveDefaults,
    getSkuSettings,
    listAllergens,
} from "@/lib/products/settings";
import { DEFAULT_SKU_PATTERN } from "@/lib/products/sku-pattern";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { getStockTracking } from "@/lib/stock/service";
import { productCategoriesHref } from "@/lib/stores/links";
import { getStorefront } from "@/lib/stores/storefronts";

/**
 * What the product editor needs about the storefront a product is sold at:
 * its name and currency, its categories and options, and whether this
 * person may change products. The currency falls back to INR only when the
 * storefront's settings cannot be read — the editor still works. Options
 * that cannot be read leave Variants with none to offer, which it says.
 * Defaults (Settings → Defaults) that cannot be read leave the built-in
 * starting values.
 *
 * `stores` is the business's storefronts: with more than one, the Variants
 * section says where each variant is sold ("Sell it at", #525), read from
 * the product's listings; unreadable, it is left out rather than guessed.
 *
 * `variantCap` is the plan's cap on one product's variants (DEC-158), so
 * Variants can say it before a save; null when nothing caps them or the
 * plan couldn't be read, and the API still refuses and says why.
 */
export async function loadEditorContext(
    store: { id: string; name: string },
    product?: { id: string; categoryId: string | null },
    stores: readonly { id: string; name: string }[] = [store],
) {
    const several = stores.length > 1;
    const [
        settings,
        categories,
        options,
        organization,
        sku,
        allergens,
        defaults,
        business,
        listings,
        businessSettings,
        rates,
        billing,
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
        // The business's Track stock switch (#515); unknown reads as on, and
        // the product's own switch decides.
        getStockTracking().catch(() => null),
        product && several
            ? getProductListings(product.id).catch((error: unknown) => {
                  unstable_rethrow(error);
                  return null;
              })
            : null,
        // Whether the business is GST-registered: its products carry a GST
        // rate and an HSN code only then. Unknown reads as registered, so
        // a failed read never hides a field someone needs.
        readOrganizationSettings().catch(() => null),
        // Whether a priced product has to choose its rate: only where the
        // business is known to be registered. Unknown asks for nothing, so
        // a read that failed never blocks a save.
        readMissingRates(),
        billingAccessOrNull(),
    ]);
    return {
        storeId: store.id,
        storeName: store.name,
        currency: settings?.currency ?? "INR",
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        categoriesHref: productCategoriesHref(),
        options,
        canWrite: canWriteProducts(organization),
        canStock: canStockProducts(organization),
        viewerRole: organization ? roleName(organization) : "Member",
        stores: stores.map((s) => ({ id: s.id, name: s.name })),
        listings,
        businessTracks: business?.tracked ?? true,
        gstRegistered: businessSettings?.ok
            ? (businessSettings.data.tax?.registered ?? false)
            : true,
        gstRateNeeded: rates?.registered === true,
        // How a registered business's prices carry GST (12 Oct 2026), for
        // Basics' "Same as the business (…)". Null when the business isn't
        // registered or its settings couldn't be read.
        businessPriceMode:
            businessSettings?.ok && businessSettings.data.tax?.registered
                ? businessModeOf(businessSettings.data.tax.priceMode)
                : (rates?.priceMode ?? null),
        sku: sku ?? { pattern: DEFAULT_SKU_PATTERN, suggest: true, n: 1 },
        allergens: (allergens ?? []).map((a) => ({ id: a.id, name: a.name })),
        defaults,
        variantCap: variantCapOf(billing),
    };
}
