import { money } from "../numbers";

/**
 * The break-even calculator's sums (design BreakEven*.dc.html, its
 * generator genA/breakeven.py), in paise: pure, so a test pins the
 * boards' sample. Sales are whole, so they round up: 283.3 sales don't
 * cover the month, 284 do.
 */

export interface BreakEvenInput {
    /** Every fixed cost a month, in paise. */
    fixed: number;
    /** The average sale before GST, in paise. */
    average: number;
    /** What one sale costs, in paise; under `average`. */
    perSale: number;
    days: number;
    /** Sales a month now, when they gave it. */
    now: number | null;
}

export function breakEven(i: BreakEvenInput) {
    const covers = i.average - i.perSale;
    const sales = Math.ceil(i.fixed / covers);
    return {
        covers,
        sales,
        aDay: i.days > 0 ? Math.ceil(sales / i.days) : null,
        takings: sales * i.average,
        /** Past (+) or short of (−) break-even, in sales and in paise a month. */
        gap:
            i.now === null
                ? null
                : { sales: i.now - sales, money: i.now * covers - i.fixed },
    };
}

export type BreakEven = ReturnType<typeof breakEven>;

export const WORDS = {
    form: "Your costs and sales",
    fixed: "Fixed costs a month",
    costs: ["Rent", "Salaries", "Electricity, internet and the rest"],
    another: "Another cost",
    addCost: "+ Add a cost",
    costBad: "Type the amount in rupees, like 40,000.",
    sales: "Your sales",
    average: "Average sale",
    averageHint: "What a customer spends on one visit or order, before GST.",
    averageBad: "Type the average sale in rupees, like 500.",
    perSale: "Cost per sale",
    perSaleHint:
        "Stock or products used, packing, and the card or UPI fee for one sale.",
    perSaleBad: "Type what one sale costs you in rupees, like 200.",
    days: "Days open a month",
    daysBad: "Type the days you're open, from 1 to 31.",
    now: "Sales you make now a month (optional)",
    nowHint: "To see how far you are from it.",
    nowBad: "Type how many sales a month, like 250.",
    empty: "Add your costs and your average sale to see your break-even.",
    figure: "Sales to break even",
    none: "No break-even at these numbers.",
    gate: "Get the working as a PDF",
    gateButton: "Email me the PDF",
    print: "Print or save as PDF",
} as const;

/** The error on Cost per sale when a sale can never pay for itself. */
export function noBreakEven(average: number, perSale: number): string {
    return `That's ${perSale > average ? "more than" : "the same as"} the average sale of ${money(average)}, so more sales won't cover your costs. Raise the price or cut the cost per sale.`;
}

export function resultRows(i: BreakEvenInput, b: BreakEven) {
    return [
        ...(b.aDay === null
            ? []
            : [{ k: `A day, open ${i.days} days`, v: `About ${b.aDay}` }]),
        { k: "Each sale covers", v: money(b.covers, true) },
        {
            k: "Takings at break-even",
            v: `${money(b.takings)} a month`,
            total: true,
        },
    ];
}

/** How far past or short of break-even today's sales are, when given. */
export function gapNote(i: BreakEvenInput, b: BreakEven): string | null {
    if (!b.gap || i.now === null) return null;
    const { sales, money: m } = b.gap;
    if (sales === 0 && m >= 0) return `At ${i.now} sales you're at break-even.`;
    if (m >= 0)
        return `At ${i.now} sales you're ${sales} past break-even, about ${money(m)} profit a month.`;
    return `At ${i.now} sales you're ${-sales} short, about ${money(-m)} a month below your costs.`;
}
