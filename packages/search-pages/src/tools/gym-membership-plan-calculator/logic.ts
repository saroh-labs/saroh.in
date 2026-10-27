import { money } from "../numbers";

/**
 * The gym membership plan calculator's sums (design GymPlan*.dc.html, its
 * generator genC/gym.py), in paise: pure, so a test pins the boards'
 * sample. Rounding is half up to the step; the saving is worked out from
 * the rounded price, so what a member is told they save is what they do.
 */

export const ROUNDING = [
    { value: "1", label: "Exact" },
    { value: "10", label: "Nearest ₹10" },
    { value: "50", label: "Nearest ₹50" },
    { value: "100", label: "Nearest ₹100" },
] as const;

export type Rounding = (typeof ROUNDING)[number]["value"];

export interface GymInput {
    /** One month on its own, in paise. */
    monthly: number;
    /** Percent off 3 months and 12 months, 0 to 100. */
    quarter: number;
    year: number;
    rounding: Rounding;
}

export interface Plan {
    name: string;
    months: number;
    /** Paise. */
    price: number;
    /** Paise, before rounding. */
    raw: number;
    saves: number;
}

function plan(i: GymInput, name: string, months: number, off: number): Plan {
    const full = i.monthly * months;
    const raw = (full * (10000 - Math.round(off * 100))) / 10000;
    const step = Number(i.rounding) * 100;
    // "Exact" keeps the paisa; a step rounds half up to it.
    const price =
        i.rounding === "1"
            ? Math.round(raw)
            : Math.floor((raw + step / 2) / step) * step;
    return { name, months, price, raw, saves: full - price };
}

export function plans(i: GymInput): Plan[] {
    return [
        plan(i, "Monthly", 1, 0),
        plan(i, "3 months", 3, i.quarter),
        plan(i, "12 months", 12, i.year),
    ];
}

/** A plan's price a month, to the rupee, as the table shows it. */
export const aMonth = (p: Plan) => Math.round(p.price / p.months / 100) * 100;

/** The table's rows: plan, price, a month, what a member saves. */
export function planRows(ps: Plan[]) {
    return ps.map((p) => [
        p.name,
        money(p.price),
        money(aMonth(p)),
        p.months === 1 ? "—" : money(p.saves),
    ]);
}

const WORDS_N = [
    "",
    "one month",
    "two months",
    "three months",
    "four months",
    "five months",
    "six months",
];

/** The note: what 12 months saves, or that a longer plan costs more. */
export function planNote(i: GymInput, ps: Plan[]): string {
    const [, q, y] = ps as [Plan, Plan, Plan];
    if (y.price / 12 > q.price / 3)
        return `12 months costs more a month than 3 months, because its discount is smaller (${i.year}% against ${i.quarter}%). Members would buy 3 months four times. Give 12 months the bigger discount.`;
    const free = y.saves / i.monthly;
    const months =
        Number.isInteger(free) && WORDS_N[free]
            ? `, ${WORDS_N[free]} free`
            : "";
    return `A member who pays for 12 months saves ${money(y.saves)}${months}.`;
}

/** Said when rounding moved a price, so the discounts aren't exact any more. */
export function roundedLine(i: GymInput, ps: Plan[]): string | null {
    return ps.some((p) => p.price !== p.raw)
        ? `3 months at ${i.quarter}% off, 12 months at ${i.year}% off, then rounded.`
        : null;
}

export const WORDS = {
    form: "Your prices",
    monthly: "Monthly price",
    monthlyHint: "What one month costs on its own.",
    monthlyBad: "Type your monthly price in rupees, like 1,500.",
    quarter: "Discount for 3 months",
    year: "Discount for 12 months",
    discountBad: "A discount is between 0 and 100%. At 100% the plan is free.",
    rounding: "Round prices to",
    roundingHint: "Rounded prices are easier to say at the desk.",
    label: "Your plans",
    empty: "Type your monthly price to see each plan.",
    figure: "12 months works out to",
    heads: ["Plan", "Price", "A month", "Member saves"],
    gst: "Prices are as you type them. If you charge GST, say whether they include it; check the rate with your CA.",
    gate: "Get the price list as a PDF",
    gateButton: "Email it",
    print: "Print or save as PDF",
} as const;
