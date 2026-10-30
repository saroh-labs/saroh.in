import { rupee } from "../../money";

/**
 * The no-show cost calculator's sums (design NoShowCost*.dc.html, its
 * generator genC/noshow.py): pure, so they are pinned by a test. A month
 * is a week × 52 ÷ 12; the deposit counts only what is kept from people
 * who don't turn up, never a guess at how many fewer would miss.
 */

export const DEPOSITS = [
    { value: "none", label: "No deposit", share: 0 },
    { value: "quarter", label: "25%", share: 0.25 },
    { value: "half", label: "50%", share: 0.5 },
    { value: "full", label: "Full price", share: 1 },
] as const;

export type Deposit = (typeof DEPOSITS)[number]["value"];

export interface NoShowInput {
    bookings: number;
    /** Out of every 100 bookings. */
    rate: number;
    average: number;
    deposit: Deposit;
}

export interface NoShowCost {
    perMonth: number;
    lostMonth: number;
    lostYear: number;
    keptMonth: number;
    keptYear: number;
}

const share = (d: Deposit) => DEPOSITS.find((x) => x.value === d)?.share ?? 0;

export function noShowCost(i: NoShowInput): NoShowCost {
    const week = (i.bookings * i.rate) / 100;
    const lostYear = week * 52 * i.average;
    const s = share(i.deposit);
    return {
        perMonth: (week * 52) / 12,
        lostMonth: lostYear / 12,
        lostYear,
        keptMonth: (lostYear / 12) * s,
        keptYear: lostYear * s,
    };
}

/** A typed number: commas and spaces allowed, "" and anything else is null. */
export function readNumber(value: string): number | null {
    const v = value.replace(/[,\s₹%]/g, "");
    if (!/^\d+(\.\d+)?$/.test(v)) return null;
    return Number(v);
}

export const WORDS = {
    form: "Your bookings",
    bookings: "Bookings a week",
    bookingsHint: "All bookings, kept or not.",
    bookingsBad: "Type how many bookings a week, like 40.",
    rate: "How many don't turn up",
    rateHint: "Out of every 100 bookings. Count the last month if you can.",
    rateBad:
        "A no-show rate is between 0 and 100%. This is out of every 100 bookings.",
    average: "Average booking",
    averageBad: "Type the average booking in rupees, like 800.",
    deposit: "Deposit you'd ask at booking",
    depositHint: "Kept when someone doesn't turn up.",
    empty: "Fill in your bookings, no-shows and average booking to see what no-shows cost.",
    figure: "Lost to no-shows a month",
    phoneFigure: "Lost a month",
    honest: "This counts only the deposit you keep. It doesn't guess how many fewer people miss once a deposit is asked.",
    gate: "Get this working as a PDF",
    gateButton: "Email it",
    print: "Print or save as PDF",
} as const;

const depositName = (d: Deposit) =>
    d === "full" ? "full-price" : `${share(d) * 100}%`;

/** The result's rows, as the boards list them. */
export function resultRows(i: NoShowInput, c: NoShowCost) {
    const r = (n: number) => rupee(Math.round(n));
    const rows: { k: string; v: string; total?: boolean }[] = [
        { k: "No-shows a month", v: `about ${Math.round(c.perMonth)}` },
    ];
    if (i.deposit !== "none") {
        rows.push(
            { k: "Lost a month", v: r(c.lostMonth) },
            {
                k: `Kept by a ${depositName(i.deposit)} deposit`,
                v: `${r(c.keptMonth)} a month`,
            },
            { k: "Still lost", v: `${r(c.lostMonth - c.keptMonth)} a month` },
        );
    }
    rows.push({ k: "Lost a year", v: r(c.lostYear), total: true });
    return rows;
}

/** The note under the rows: what the deposit keeps, or what each would. */
export function depositNote(i: NoShowInput, c: NoShowCost): string {
    const r = (n: number) => rupee(Math.round(n));
    if (i.deposit === "none") {
        const q = noShowCost({ ...i, deposit: "quarter" }).keptMonth;
        const h = noShowCost({ ...i, deposit: "half" }).keptMonth;
        return `With a 25% deposit you'd keep ${r(q)} a month. With half, ${r(h)}.`;
    }
    return `A ${depositName(i.deposit)} deposit keeps ${r(c.keptYear)} a year of it. ${WORDS.honest}`;
}
