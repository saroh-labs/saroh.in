import type { UsageView } from "@saroh/marketing/pricing-model";
import { usageView as usageOf } from "@saroh/marketing/pricing-usage";
import type { Catalog } from "@saroh/pricing-catalog";

import { featuresOff } from "./feature-switches";
import { PRICING_SITE } from "./pricing-view";

/** "Usage beyond your plan" in this site's money and words, without switched-off features' rows. */
export function usageView(
    catalog: Catalog,
    withGst: boolean,
    off: readonly string[] = featuresOff(),
): UsageView | null {
    return usageOf(catalog, withGst, PRICING_SITE, off);
}
