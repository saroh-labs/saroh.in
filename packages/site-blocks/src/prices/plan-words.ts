import { accountMoney } from "../account/model";

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

/** "₹1,200 / month"; the bare price for an unknown interval. */
export function planPrice(plan: {
    price: string;
    currency: string;
    interval: string;
}): string {
    const money = accountMoney(plan.price, plan.currency);
    const per = INTERVALS[plan.interval]?.per;
    return per ? `${money} / ${per}` : money;
}

/** "month", "3 months"; "period" for an interval this build doesn't know. */
export function planPeriod(plan: { interval: string }): string {
    return INTERVALS[plan.interval]?.each ?? "period";
}
