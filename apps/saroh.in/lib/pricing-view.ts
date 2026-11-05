import type { Catalog } from "@saroh/pricing-catalog";
import {
    formatCount,
    formatInr,
    GST_PERCENT,
    withGstPaise,
} from "@saroh/pricing-catalog";

import type {
    PricingPageModel,
    PricingSite,
} from "@saroh/marketing/pricing-model";
import {
    pricingPageModel as pageModel,
    placeholderPricingModel as placeholderModel,
} from "@saroh/marketing/pricing-view";

import { PLAN_TEASERS } from "@/content/home";
import {
    PLAN_DETAILS_PLACEHOLDER,
    PRICE_NOTE,
    PRICE_PLACEHOLDER,
} from "@/content/types";

export { viewKey } from "@saroh/marketing/pricing-model";
export type {
    CompareRow,
    Cycle,
    PlanCardView,
    PricingPageModel,
    PricingView,
    ViewKey,
} from "@saroh/marketing/pricing-model";

/** This site's money and tax: rupees, and GST said in every place it shows. */
export const PRICING_SITE: PricingSite = {
    money: formatInr,
    count: formatCount,
    tax: {
        add: withGstPaise,
        subExcl: "+ GST",
        subIncl: "Incl. GST",
        afterExcl: " + GST",
        afterIncl: " incl. GST",
        footnoteExcl: `Prices before GST (${GST_PERCENT}%).`,
        footnoteIncl: `Prices include ${GST_PERCENT}% GST.`,
        noteExcl: `Prices are before GST. ${GST_PERCENT}% GST is added to your bill.`,
        noteIncl: `Prices include ${GST_PERCENT}% GST.`,
    },
};

/** The pricing page for a catalogue, in this site's money and words. */
export function pricingPageModel(catalog: Catalog): PricingPageModel {
    return pageModel(catalog, PRICING_SITE);
}

/**
 * The page with no catalogue to show (the API unreachable on a first build,
 * or no version published yet): the plan names, every price the
 * placeholder, every detail `PLAN_DETAILS_PLACEHOLDER`.
 */
export function placeholderPricingModel(): PricingPageModel {
    return placeholderModel({
        plans: PLAN_TEASERS,
        price: PRICE_PLACEHOLDER,
        note: PRICE_NOTE,
        details: PLAN_DETAILS_PLACEHOLDER,
    });
}
