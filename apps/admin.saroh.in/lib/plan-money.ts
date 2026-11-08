import { formatMinor, indiaOnlyWord } from "@saroh/pricing-catalog";

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

/**
 * A warning for words only India's catalogue means (owner, 8 Nov 2026:
 * "filter and flag"), on a console whose plans carry no GST: saroh.tech
 * leaves such a row or line out, so the draft says so. Never blocks a save
 * or a publish. Null on India's console, or when there is none.
 */
export const indiaOnlyNote = (text: string): string | null => {
    const word = planTaxed() ? null : indiaOnlyWord(text);
    return word
        ? `"${word}" only means something in India. The pricing page leaves this out.`
        : null;
};
