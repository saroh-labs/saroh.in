import type {
    PlanCardView,
    PricingPageModel,
    PricingView,
} from "@saroh/marketing/pricing-model";
import { placeholderPricingModel } from "@saroh/marketing/pricing-view";

import { PRICING } from "@/content/pricing";

/**
 * The pricing page's plans. Stage 9: with a USD catalogue, read it here and
 * return `pricingPageModel(catalog, { money, count, tax: null })`; until then
 * no catalogue is read, because the only one there is is in rupees.
 */
export function pricingModel(): PricingPageModel {
    const model = placeholderPricingModel({
        plans: PRICING.plans,
        price: PRICING.noPrice,
        note: "",
        details: "",
    });
    const words = (plan: PlanCardView): PlanCardView => {
        const { tagline, ...rest } = PRICING.words[plan.id];
        return {
            ...plan,
            tagline,
            ...(plan.cta.paid
                ? { lead: PRICING.paidLead, lines: [] }
                : {
                      ...rest,
                      per: "",
                      lines: PRICING.freeLines.map((t) => ({ t, soon: false })),
                  }),
        };
    };
    const view: PricingView = {
        plans: model.views["month-excl"].plans.map(words),
        usage: null,
        footnote: PRICING.footnote,
    };
    return {
        ...model,
        views: {
            "month-excl": view,
            "month-incl": view,
            "year-excl": view,
            "year-incl": view,
        },
        rows: [],
    };
}
