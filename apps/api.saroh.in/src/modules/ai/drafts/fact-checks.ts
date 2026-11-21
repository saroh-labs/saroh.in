import { prisma } from "@saroh/database";

/**
 * Check this (RULES §5, plan U42/U43, narrow; owner 21 Nov): Ask AI never
 * puts a fact on the website the owner didn't give. The new words of a
 * section are read for facts (prices, percentages and offers, times,
 * "free", phone numbers, numbers with a claim such as "20 years"), and each
 * one is given only when the business already says it: a price in its
 * Services, an offer in its Discounts, a time in its hours, or anything in
 * the edited section's current words (never another section's: review 07
 * B-L1). The rest are marked on the card, and the
 * server won't save until each is confirmed. Decided here, never in the
 * browser.
 */

export interface Fact {
    /** Stable for the same fact in the same field: what Confirm names. */
    id: string;
    /** The card's field it is in: "heading". */
    field: string;
    /** How it is compared: "money:180", "percent:20", "time:840". */
    key: string;
    /** The words as written: "₹180", "20% off". */
    words: string;
    why: string;
}

const WHY = {
    money: "A price that isn't in your Services or in this section",
    percent: "An offer that isn't in your Discounts or in this section",
    offer: "An offer that isn't in your Discounts or in this section",
    free: "Says free, which this section doesn't say",
    time: "A time that isn't in your hours or in this section",
    phone: "A phone number that isn't in this section",
    claim: "A number or claim that isn't in this section",
} as const;

const num = (s: string) => Number(s.replace(/,/g, ""));

/** Minutes from midnight for "2pm", "2:30 pm", "14:00". */
function minutes(h: string, m: string | undefined, ampm: string | undefined) {
    let hour = Number(h) % 24;
    const ap = ampm?.toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    return hour * 60 + Number(m ?? 0);
}

const PATTERNS: {
    kind: keyof typeof WHY;
    re: RegExp;
    key: (m: RegExpMatchArray) => string;
}[] = [
    {
        kind: "money",
        // Any currency sign before the number.
        re: /\p{Sc}\s?(\d[\d,]*(?:\.\d+)?)/gu,
        key: (m) => `money:${num(m[1])}`,
    },
    {
        kind: "money",
        // A currency code ("USD 20") or "Rs", as written: case matters.
        re: /\b(?:[A-Z]{3}|Rs\.?)\s?(\d[\d,]*(?:\.\d+)?)/g,
        key: (m) => `money:${num(m[1])}`,
    },
    {
        kind: "money",
        re: /\b(\d[\d,]*(?:\.\d+)?)\s?(?:\/-|rupees|rs\b)/gi,
        key: (m) => `money:${num(m[1])}`,
    },
    {
        kind: "percent",
        re: /\b(\d+(?:\.\d+)?)\s?%(?:\s?off)?/gi,
        key: (m) => `percent:${Number(m[1])}`,
    },
    {
        kind: "offer",
        re: /\b(discount|offer|sale|deal|coupon|cashback)s?\b/gi,
        key: (m) => `offer:${m[1].toLowerCase()}`,
    },
    { kind: "free", re: /\bfree\b/gi, key: () => "free" },
    {
        kind: "time",
        re: /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/gi,
        key: (m) => `time:${minutes(m[1], m[2], m[3])}`,
    },
    {
        kind: "time",
        re: /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(?:am|pm))/gi,
        key: (m) => `time:${minutes(m[1], m[2], undefined)}`,
    },
    {
        kind: "phone",
        re: /(?:\+\d{1,3}[\s-]?)?\b\d[\d\s-]{8,13}\d\b/g,
        key: (m) => `phone:${m[0].replace(/\D/g, "").slice(-10)}`,
    },
    {
        kind: "claim",
        re: /\b(\d[\d,]*)\+?\s?(years?|yrs|customers?|clients?|orders?|stores?|branches|reviews?|stars?|cities|towns|people|families|businesses|brands|products|lines)\b/gi,
        key: (m) =>
            `claim:${num(m[1])} ${m[2].toLowerCase().replace(/s$/, "")}`,
    },
];

/** Every fact in some words, each once. */
export function factsIn(text: string): Omit<Fact, "id" | "field">[] {
    const seen = new Set<string>();
    const out: Omit<Fact, "id" | "field">[] = [];
    for (const p of PATTERNS) {
        for (const m of text.matchAll(p.re)) {
            const key = p.key(m);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ key, words: m[0].trim(), why: WHY[p.kind] });
        }
    }
    return out;
}

/** What the business already says, as fact keys, and where each came from. */
export interface Given {
    keys: Set<string>;
    /** A key the page doesn't say, by where Saroh has it: "your Services". */
    from?: Map<string, string>;
}

/**
 * The facts the business gave: its Services' prices, its Discounts, its
 * team's hours, and every word in the edited section now (`pageText`).
 */
export async function givenFacts(
    organizationId: string,
    sectionText: string,
): Promise<Given> {
    const [services, discounts, hours] = await Promise.all([
        prisma.service.findMany({
            where: { organizationId, status: "ACTIVE" },
            select: { priceCents: true },
        }),
        prisma.discount.findMany({
            where: { organizationId },
            select: { kind: true, percentBps: true, amount: true },
        }),
        prisma.staffHours.findMany({
            where: { organizationId },
            select: { startMinute: true, endMinute: true },
        }),
    ]);
    const keys = new Set(factsIn(sectionText).map((f) => f.key));
    const from = new Map<string, string>();
    const add = (key: string, source: string) => {
        if (!keys.has(key)) from.set(key, source);
        keys.add(key);
    };
    for (const s of services) {
        if (s.priceCents !== null) {
            add(`money:${s.priceCents / 100}`, "your Services");
        }
    }
    for (const d of discounts) {
        if (d.percentBps !== null) {
            add(`percent:${d.percentBps / 100}`, "your Discounts");
        }
        if (d.amount !== null)
            add(`money:${Number(d.amount)}`, "your Discounts");
    }
    // A business with any Discount has an offer to speak of.
    if (discounts.length) {
        for (const w of ["discount", "offer", "sale", "deal", "coupon"]) {
            add(`offer:${w}`, "your Discounts");
        }
    }
    for (const h of hours) {
        add(`time:${h.startMinute}`, "your hours");
        add(`time:${h.endMinute}`, "your hours");
    }
    return { keys, from };
}

/** The new words' facts the business never gave, by field: the card's Check this. */
export function checksFor(
    fields: { field: string; new: unknown }[],
    given: Given,
): Fact[] {
    return fields.flatMap(({ field, new: value }) =>
        typeof value === "string"
            ? factsIn(value)
                  .filter((f) => !given.keys.has(f.key))
                  .map((f) => ({
                      ...f,
                      field,
                      id: `${field}:${f.key}`.slice(0, 64),
                  }))
            : [],
    );
}

/**
 * What the card says the new words are based on (RULES §5): what was asked
 * and the section's words, then only the parts of Saroh a fact in the new
 * words was taken from. A heading typed out word for word names no Services.
 */
export function basedOnFor(
    fields: { field: string; new: unknown }[],
    given: Given,
): string {
    const used = new Set<string>();
    for (const { new: value } of fields) {
        if (typeof value !== "string") continue;
        for (const f of factsIn(value)) {
            const source = given.from?.get(f.key);
            if (source) used.add(source);
        }
    }
    const parts = ["What you asked", "this section's words now", ...used];
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The checks the person hasn't confirmed: Confirm saves nothing while any
 * is left. `confirmed` is what the browser sent, only ever ids.
 */
export function unconfirmed(
    checks: Fact[],
    confirmed: readonly string[] = [],
): Fact[] {
    const sure = new Set(confirmed);
    return checks.filter((c) => !sure.has(c.id));
}
