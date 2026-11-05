import type { Currency } from "./money";

/**
 * VAT, sales tax and GST: one calculator at three addresses. The rates are
 * examples the person can change, and the page says so with a link to check.
 */
export type TaxKind = "vat" | "sales" | "gst";

export interface TaxPreset {
    label: string;
    rate: string;
}

export const TAX_KINDS: Record<
    TaxKind,
    {
        name: string;
        lower: string;
        path: string;
        currency: Currency;
        note: string;
        presets: TaxPreset[];
    }
> = {
    vat: {
        name: "VAT",
        lower: "VAT",
        path: "/tools/vat-calculator",
        currency: "GBP",
        note: "Examples only. Rates change.",
        presets: [
            { label: "UK 20%", rate: "20" },
            { label: "UAE 5%", rate: "5" },
            { label: "Ireland 23%", rate: "23" },
            { label: "Germany 19%", rate: "19" },
        ],
    },
    sales: {
        name: "Sales tax",
        lower: "sales tax",
        path: "/tools/sales-tax-calculator",
        currency: "USD",
        note: "US sales tax depends on state, county and city. Enter your combined rate.",
        presets: [
            { label: "6%", rate: "6" },
            { label: "7%", rate: "7" },
            { label: "8%", rate: "8" },
            { label: "9%", rate: "9" },
        ],
    },
    gst: {
        name: "GST",
        lower: "GST",
        path: "/tools/gst-calculator",
        currency: "AUD",
        note: "Examples only. Canada adds HST or PST in some provinces.",
        presets: [
            { label: "Australia 10%", rate: "10" },
            { label: "NZ 15%", rate: "15" },
            { label: "Canada 5%", rate: "5" },
            { label: "Singapore 9%", rate: "9" },
        ],
    },
};

export type TaxMode = "add" | "remove";

/** Amounts in cents; the rate as a percentage. */
export function taxBreakdown(mode: TaxMode, amount: number, rate: number) {
    if (mode === "add") {
        const tax = Math.round((amount * rate) / 100);
        return { net: amount, tax, gross: amount + tax };
    }
    const net = Math.round(amount / (1 + rate / 100));
    return { net, tax: amount - net, gross: amount };
}
