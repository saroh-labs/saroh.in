"use client";

import type { PricingPageModel } from "@saroh/marketing/pricing-model";
import { PricingPlans as Plans } from "@saroh/marketing/pricing-plans";
import { usePricingSwitches } from "@saroh/marketing/use-pricing-switches";

import { PRICING_COPY } from "@/content/pricing";
import { PRICE_NOTE } from "@/content/types";

import { PricingCards } from "./pricing-cards";

/**
 * Everything on the pricing page the two switches change: the shared plan
 * cards (`PricingCards`, the same on every page), then the usage table and
 * the comparison table's prices, following the same switches.
 */
export function PricingPlans({ model }: { model: PricingPageModel }) {
    const switches = usePricingSwitches(model);
    return (
        <Plans
            model={model}
            switches={switches}
            cards={<PricingCards model={model} switches={switches} />}
            usageTitle={PRICING_COPY.usageTitle}
            usageLead={PRICING_COPY.usageLead}
            placeholderNote={PRICE_NOTE}
        />
    );
}
