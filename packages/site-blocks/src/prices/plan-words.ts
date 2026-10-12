import { accountMoney } from "../account/model";
import {
    browsePriceWords,
    gstOnPriceOf,
    payPriceWords,
} from "../lib/gst-price";

/**
 * How a plan's price and period are said on a site (G9, G20): the Plans
 * block's cards and the join sheet say them the same way.
 */

const INTERVALS: Partial<
    Record<string, { every: string; per: string; each: string }>
> = {
    WEEK: { every: "Every week", per: "week", each: "week" },
    MONTH: { every: "Every month", per: "month", each: "month" },
    QUARTER: { every: "Every 3 months", per: "3 months", each: "3 months" },
    YEAR: { every: "Every year", per: "year", each: "year" },
};

/** "Every month", or null for an interval this build doesn't know. */
export function planEvery(plan: { interval: string }): string | null {
    return INTERVALS[plan.interval]?.every ?? null;
}

/** What a plan's price words read: the plan, and the API's GST on it. */
interface PricedPlan {
    price: string;
    currency: string;
    interval: string;
    gst?: unknown;
}

/**
 * "₹1,200 / month": what is paid each period, so where GST is added it is
 * the API's amount to pay ("₹2,360 / month" for a ₹2,000 plan at 18%). The
 * bare amount for an unknown interval.
 */
export function planPrice(plan: PricedPlan): string {
    const money = payPriceWords(
        accountMoney(plan.price, plan.currency),
        plan.gst,
        plan.currency,
    );
    const per = INTERVALS[plan.interval]?.per;
    return per ? `${money} / ${per}` : money;
}

/**
 * The price where a plan is only browsed (no Join beside it): the typed
 * price and its period, with "+ GST" after it when GST comes on top.
 */
export function planBrowsePrice(plan: PricedPlan): string {
    const money = accountMoney(plan.price, plan.currency);
    const per = INTERVALS[plan.interval]?.per;
    return browsePriceWords(
        per ? `${money} / ${per}` : money,
        gstOnPriceOf(plan.gst)?.mode === "ADDED",
    );
}

/** "month", "3 months"; "period" for an interval this build doesn't know. */
export function planPeriod(plan: { interval: string }): string {
    return INTERVALS[plan.interval]?.each ?? "period";
}
