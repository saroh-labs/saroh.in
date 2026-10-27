/**
 * The loyalty stamp card maker's rules (design LoyaltyCard*.dc.html,
 * generator genB/gen.py `loyalty`): a card of 2 to 12 stamps, the last
 * one the reward. Pure, so the tests pin the boards' Northwind Bakes card.
 */

export const COUNTS = [
    { value: "6", label: "6" },
    { value: "8", label: "8" },
    { value: "10", label: "10" },
    { value: "12", label: "12" },
    { value: "other", label: "Other" },
] as const;
export type Count = (typeof COUNTS)[number]["value"];

export const SHEETS = [
    { value: "ten", label: "10 cards on A4" },
    { value: "one", label: "One card, 85 × 55 mm" },
] as const;
export type Sheet = (typeof SHEETS)[number]["value"];

export const MAX_STAMPS = 12;
export const MIN_STAMPS = 2;

/** 1 → "1st", 2 → "2nd", 10 → "10th", 11 → "11th". */
export function ordinal(n: number): string {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    const end = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
    return `${n}${end}`;
}

/** The typed "Other" count: a whole number, or why it can't be one. */
export function readCount(
    value: string,
): { ok: true; n: number } | { ok: false; problem: string | null } {
    const v = value.trim();
    if (!v) return { ok: false, problem: null };
    if (!/^\d+$/.test(v)) return { ok: false, problem: WORDS.countBad };
    const n = Number(v);
    if (n > MAX_STAMPS) return { ok: false, problem: WORDS.tooMany };
    if (n < MIN_STAMPS) return { ok: false, problem: WORDS.tooFew };
    return { ok: true, n };
}

/** "Buy 9, the 10th is free: Free coffee". */
export const offerLine = (n: number) =>
    `Buy ${n - 1}, the ${ordinal(n)} is free:`;

/** Columns: one row up to 6, else two rows. */
export const columns = (n: number) => (n > 6 ? Math.ceil(n / 2) : n);

export const WORDS = {
    form: "Your stamp card",
    biz: "Business name",
    area: "Area or tagline",
    count: "Stamps on the card",
    countHint:
        "The last stamp is the reward. 10 means buy 9, get the 10th free.",
    other: "How many stamps",
    countBad: "Type a whole number of stamps, like 9.",
    tooMany:
        "A card fits up to 12 stamps. Try 12, or make the reward come sooner.",
    tooFew: "A card needs at least 2 stamps: one to earn, one for the reward.",
    reward: "The reward",
    rewardHint: "What they get on the last stamp. Keep it short.",
    noReward: "Say what they get on the last stamp, like “Free coffee”.",
    rule: "One stamp for",
    ruleHint: "Printed on the back.",
    phone: "Phone",
    phoneHint: "Printed on the back.",
    sheet: "Print as",
    out: "Your stamp card",
    caption: "Front of the card. The back has your rule and phone number.",
    emptyCaption: "Type a name to make yours.",
    free: "FREE",
    back: "Show this card at each visit for a stamp.",
    gate: "Get your stamp cards",
    gateButton: "Get my cards",
    gateAfter: {
        ten: "Prints ten cards on an A4 sheet, fronts then backs, with cut lines. Or save it as a PDF for a print shop.",
        one: "Prints one card, front then back. Or save it as a PDF for a print shop.",
    },
    print: "Print or save as PDF",
} as const;
