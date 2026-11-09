import { formatMinor } from "@saroh/pricing-catalog";

import { PROFILE } from "@/lib/edition";

/**
 * Saroh's plan money as this workspace's edition prices it (stage 9,
 * KTD6c): rupees with GST in India, US dollars with no tax abroad. Never
 * the business's own currency: a business selling in pounds still sees its
 * Saroh plan in dollars. Every plan, quote, invoice and add-on amount on
 * Plan and billing is said through these.
 */
const gst = () => PROFILE.sarohPlanMoney.tax === "gst";

/** An amount in the plan currency's minor unit, for people. */
export const planMoney = (minor: number): string =>
    formatMinor(minor, PROFILE.sarohPlanMoney.currency);

/** " + GST" after a price before tax, where the plans carry GST. */
export const plusTax = (): string => (gst() ? " + GST" : "");

/** " (incl. GST)" after an amount with its tax, where there is GST. */
export const inclTax = (): string => (gst() ? " (incl. GST)" : "");

/** ", before GST" where the plans carry GST. */
export const beforeTax = (): string => (gst() ? ", before GST" : "");

/** "₹100 + ₹18 GST = ₹118", or just the total where there is no tax. */
export function taxSum(net: number, taxed: number, total: number): string {
    return gst()
        ? `${planMoney(net)} + ${planMoney(taxed)} GST = ${planMoney(total)}`
        : planMoney(total);
}
