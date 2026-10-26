import type { Code } from "./codes";
import { CODES } from "./codes";

/**
 * The HSN/SAC code finder's search (design HsnSacFinder*.dc.html, its
 * generator genA/hsn.py): in the browser, over `CODES`. Every word typed
 * has to start a word of the item (its name, description or the words
 * people search it by); digits match the start of a code.
 */

export const FILTERS = [
    { value: "all", label: "All" },
    { value: "HSN", label: "Goods (HSN)" },
    { value: "SAC", label: "Services (SAC)" },
] as const;

export type Filter = (typeof FILTERS)[number]["value"];

export const POPULAR = [
    "Haircut",
    "Facial",
    "Gym membership",
    "Cake",
    "Saree",
    "Tailoring",
] as const;

const wordsOf = (c: Code) =>
    `${c.name} ${c.desc} ${c.words}`.toLowerCase().split(/[^a-z0-9]+/);

/** What a search finds: every typed word starts a word of the item, or the code. */
export function search(query: string, filter: Filter): Code[] {
    const terms = query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    if (!terms.length) return [];
    return CODES.filter(
        (c) =>
            (filter === "all" || c.kind === filter) &&
            terms.every((t) =>
                /^\d+$/.test(t)
                    ? c.code.startsWith(t)
                    : wordsOf(c).some((w) => w.startsWith(t)),
            ),
    );
}

export const countText = (n: number, query: string) =>
    `${n} ${n === 1 ? "code" : "codes"} for “${query.trim()}”`;

/** My list as a spreadsheet. */
export function listCsv(codes: readonly Code[]): string {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
        "Type,Code,What,Usual GST rate (to confirm with your CA)",
        ...codes.map((c) => [c.kind, c.code, q(c.desc), q(c.rate)].join(",")),
    ].join("\n");
}

export const WORDS = {
    form: "Find a code",
    search: "What do you sell?",
    placeholder: "Like cake, haircut or saree",
    show: "Show",
    popular: "Popular searches",
    none: (q: string) => `Nothing for “${q.trim()}”.`,
    noneTry:
        "Try a wider word, like “cake” or “bakery”, or type the code if you know it.",
    rateNote:
        "Usual rates since 22 Sep 2025. Some codes carry more than one rate, by the exact item or its price.",
    ca: "Check with your CA before you bill.",
    add: "Add",
    added: "✓ In your list",
    list: "My list",
    listEmpty: "Add codes from your search to keep them here.",
    listHint: "Use it to set up your products and services once.",
    remove: "Remove",
    gate: "Get your list as a spreadsheet (CSV)",
    gateButton: "Email me the file",
    csv: "Download your list (CSV)",
} as const;
