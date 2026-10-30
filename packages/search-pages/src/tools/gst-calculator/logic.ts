import type { Sum } from "../_documents/logic";
import { bps, money, ratePct, short } from "../_documents/logic";

/**
 * The GST calculator's sums (boards GstCalculator*.dc.html): a price before
 * GST or with it included, a rate, and the customer in the seller's state
 * (CGST + SGST) or another (IGST). Integer paise throughout; the tax is
 * rounded to the paisa, and working back from a total, the price is
 * rounded and the GST is what's left, so the parts always add up.
 */

/** GST's slabs since 22 Sep 2025, as chips. */
export const SLABS = ["0", "5", "18", "40"] as const;
/** The rest of GST's rates, under Other rate. */
export const OTHER = ["0.25", "1.5", "3", "12", "28"] as const;

export interface GstInput {
    paise: number;
    rate: string;
    /** The price typed already has GST in it. */
    included: boolean;
    /** The customer is in another state. */
    inter: boolean;
}

export interface GstResult {
    figureLabel: string;
    figure: string;
    rows: (Sum & { total?: boolean })[];
    /** Said under the rows, at 0%. */
    note: string | null;
}

export function gstCalc(i: GstInput): GstResult {
    const b = bps(i.rate);
    const before = i.included
        ? Math.round((i.paise * 10_000) / (10_000 + b))
        : i.paise;
    const tax = i.included
        ? i.paise - before
        : Math.round((before * b) / 10_000);
    const after = before + tax;
    const other = i.included
        ? { k: "Price with GST", v: money(after) }
        : { k: "Price before GST", v: money(before) };
    const figure = i.included
        ? { label: "Price before GST", value: short(before) }
        : { label: "Price with GST", value: short(after) };
    if (b === 0)
        return {
            figureLabel: figure.label,
            figure: figure.value,
            rows: [other, { k: "GST at 0%", v: money(0) }],
            note: WORDS.zero,
        };
    const half = Math.floor(tax / 2);
    const split = i.inter
        ? [{ k: `IGST ${ratePct(b)}`, v: money(tax) }]
        : [
              { k: `CGST ${ratePct(b / 2)}`, v: money(tax - half) },
              { k: `SGST ${ratePct(b / 2)}`, v: money(half) },
          ];
    return {
        figureLabel: figure.label,
        figure: figure.value,
        rows: [
            other,
            ...split,
            { k: "GST in total", v: money(tax), total: true },
        ],
        note: null,
    };
}

/** The working as text, for Copy: the figure first, then each row. */
export function working(r: GstResult): string {
    return [
        `${r.figureLabel}: ${r.figure}`,
        ...r.rows.map((x) => `${x.k}: ${x.v}`),
    ].join("\n");
}

export const WORDS = {
    form: "Your price",
    mode: "The price you have",
    before: "Before GST",
    included: "With GST included",
    price: "Price",
    priceBad: "Type a price in rupees, like 1500 or 1500.50.",
    rate: "GST rate",
    other: "Other rate",
    otherRates: "Other rates",
    rateHint:
        "GST's slabs since 22 Sep 2025. Other rate has the rest, from the same list Saroh's invoices use.",
    where: "Customer is",
    mine: "In my state",
    another: "In another state",
    empty: "Type a price to see the GST.",
    zero: "0% is for nil-rated or exempt supplies: no GST on this bill.",
    gate: "Get the working to copy",
    gateButton: "Email it",
    copy: "Copy the working",
    copied: "✓ Copied",
    copiedLine:
        "The working is on your clipboard, ready to paste into a message or a bill.",
    copyFailed:
        "This browser didn't let us copy. Select the numbers and copy them.",
    held: (paise: number) =>
        `Still showing ${short(paise)}. Fix the price to work it out again.`,
} as const;
