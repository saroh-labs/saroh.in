import type { UsageView } from "@saroh/marketing/pricing-model";
import { usageView as usageOf } from "@saroh/marketing/pricing-usage";
import type { Catalog } from "@saroh/pricing-catalog";

import { PRICING_SITE } from "./pricing-view";

/** "Usage beyond your plan" in this site's money and words. */
export function usageView(
    catalog: Catalog,
    withGst: boolean,
): UsageView | null {
    return usageOf(catalog, withGst, PRICING_SITE);
}
