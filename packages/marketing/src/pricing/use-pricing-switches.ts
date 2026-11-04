"use client";

import { useState } from "react";

import type { PricingPageModel, PricingSwitches } from "./pricing-model";
import { viewKey } from "./pricing-model";

/**
 * The two switches (yearly, with tax) and the view they pick from the
 * model the server worked out (`pricingPageModel`). A pricing page holds them
 * itself so its tables follow the same switches as its cards.
 */
export function usePricingSwitches(model: PricingPageModel): PricingSwitches {
    const [yearly, setYearly] = useState(false);
    const [withTax, setWithTax] = useState(model.tax.initial);
    return {
        yearly,
        setYearly,
        withTax,
        setWithTax,
        view: model.views[viewKey(yearly && !!model.yearly, withTax)],
    };
}
