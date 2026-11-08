import { formatMinor } from "@saroh/pricing-catalog";

import { PROFILE } from "@/lib/edition";

/**
 * The money this console's catalogue is priced in (stage 9, U8): rupees
 * with GST on India's console, US dollars with no tax on Global's. Every
 * price the Plans screens draw or take is in it.
 */
export const planMoney = (minor: number): string =>
    formatMinor(minor, PROFILE.sarohPlanMoney.currency);

/** The sign inside a price box: "₹" or "$". */
export const planCurrencySign = (): string =>
    PROFILE.sarohPlanMoney.currency === "INR" ? "₹" : "$";

/** Whether this console's plans carry GST (India's), so its controls show. */
export const planTaxed = (): boolean => PROFILE.sarohPlanMoney.tax === "gst";
