import { money, percent } from "../numbers";

/**
 * The profit margin calculator's sums (design ProfitMargin*.dc.html, its
 * generator genA/margin.py), in paise and basis points so no float
 * touches a rupee: pure, so a test pins the boards' sample.
 */

/** GST's slabs since 22 Sep 2025 as chips; "Other rate" opens the rest. */
export const RATE_CHIPS = [
    { value: "0", label: "0%" },
    { value: "5", label: "5%" },
    { value: "18", label: "18%" },
    { value: "40", label: "40%" },
    { value: "other", label: "Other rate" },
] as const;

/** The rest of the rates Saroh's invoices offer (the API's GST_RATES). */
export const OTHER_RATES = ["0.25", "1.5", "3", "12", "28"] as const;

export const MODES = [
    { value: "before", label: "Before GST" },
    { value: "with", label: "With GST included" },
] as const;

export type Mode = (typeof MODES)[number]["value"];

export interface MarginInput {
    /** Paise. */
    cost: number;
    /** Paise, as typed: before GST or with it, by `mode`. */
    price: number;
    mode: Mode;
    /** The GST rate as a percentage, "18" or "0.25". */
    rate: string;
    /** The margin they want, a percentage under 100; null when not given. */
    target: number | null;
}

const bp = (rate: string) => Math.round(Number(rate) * 100);
const addGst = (paise: number, rate: string) =>
    Math.round((paise * (10000 + bp(rate))) / 10000);

export function margin(i: MarginInput) {
    const before =
        i.mode === "with"
            ? Math.round((i.price * 10000) / (10000 + bp(i.rate)))
            : i.price;
    const withGst = i.mode === "with" ? i.price : addGst(i.price, i.rate);
    const profit = before - i.cost;
    const target =
        i.target === null
            ? null
            : Math.round((i.cost * 100) / (100 - i.target));
    return {
        before,
        withGst,
        gst: withGst - before,
        profit,
        margin: (profit / before) * 100,
        markup: i.cost > 0 ? (profit / i.cost) * 100 : null,
        targetBefore: target,
        targetWith: target === null ? null : addGst(target, i.rate),
        breakEvenWith: addGst(i.cost, i.rate),
    };
}

export type Margin = ReturnType<typeof margin>;

export const WORDS = {
    form: "Your item",
    cost: "Cost to you",
    costHint:
        "What one costs you, without GST if you claim it back as input credit.",
    costBad: "Type what one costs you in rupees, like 600.",
    price: "Selling price",
    priceBad: "Type a selling price above ₹0, like 1,000.",
    mode: "Your selling price is",
    rate: "GST rate",
    rateHint:
        "GST's slabs since 22 Sep 2025. Other rate has the rest, from the same list Saroh's invoices use.",
    other: "Other GST rate",
    target: "Margin you want (optional)",
    targetHint: "Optional. We'll work out the price that gives it.",
    targetBad:
        "A margin has to be under 100%, because it's a share of the price. Try 60.",
    empty: "Type a cost and a price to see your margin.",
    figure: "Margin",
    gate: "Get the working as a PDF",
    gateButton: "Email me the PDF",
    print: "Print or save as PDF",
} as const;

/** The result's rows, as the boards list them for each way of pricing. */
export function resultRows(i: MarginInput, m: Margin) {
    const r = (p: number) => money(p, true);
    const gst = `GST ${i.rate}%`;
    const profit = {
        k: m.profit < 0 ? "Loss per sale" : "Profit per sale",
        v: r(m.profit),
    };
    const markup = {
        k: "Markup on cost",
        v: m.markup === null ? "—" : percent(m.markup),
    };
    const rows =
        i.mode === "with"
            ? [
                  { k: "Price before GST", v: r(m.before) },
                  { k: gst, v: r(m.gst) },
                  profit,
                  markup,
              ]
            : [profit, markup, { k: `Price with ${gst}`, v: r(m.withGst) }];
    return rows.map((row, n) => ({ ...row, total: n === 3 }));
}

/** The note under the rows: a loss said plainly, or the price for their margin. */
export function marginNote(i: MarginInput, m: Margin): string | null {
    if (m.profit < 0)
        return `You lose ${money(-m.profit)} on each one. To break even, sell at ${money(i.cost)} before GST, ${money(m.breakEvenWith)} with GST.`;
    if (m.targetBefore === null || m.targetWith === null) return null;
    return `For a ${i.target}% margin, sell at ${money(m.targetBefore, true)} before GST, ${money(m.targetWith, true)} with GST.`;
}
