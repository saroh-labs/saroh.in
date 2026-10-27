import { rupee } from "../../money";
import { readNumber } from "../no-show-cost-calculator/logic";

/**
 * The gift voucher maker's rules (design GiftVoucher*.dc.html, generator
 * genB/gen.py `voucher`): what it's worth (an amount or a named service),
 * a code made in the browser and an end date. Codes are never checked
 * against a list: the owner writes them in their register. Pure, so the
 * tests pin the boards' Rye Studio voucher.
 */

export const KINDS = [
    { value: "amount", label: "An amount" },
    { value: "service", label: "A service" },
] as const;
export type Kind = (typeof KINDS)[number]["value"];

// No 0/O, 1/I/L: a code read out over the phone shouldn't be misheard.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** The code's start: the business's first three letters, or GFT. */
export function codePrefix(biz: string): string {
    const letters = biz.toUpperCase().replace(/[^A-Z]/g, "");
    return letters.length >= 3 ? letters.slice(0, 3) : "GFT";
}

/** "RYE-7K2Q-9M": 6 random characters from `random` (0 ≤ x < 1). */
export function makeCode(biz: string, random: () => number): string {
    const pick = () => ALPHABET[Math.floor(random() * ALPHABET.length)] ?? "A";
    const s = Array.from({ length: 6 }, pick).join("");
    return `${codePrefix(biz)}-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** A browser random number, from crypto when there is one. */
export function browserRandom(): number {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return (a[0] ?? 0) / 2 ** 32;
}

/** "2027-04-30" → "30 Apr 2027". */
export function showDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

const MONTHS = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
];

/**
 * A typed date as "2027-04-30", or null when it isn't one: "30 Apr 2027",
 * "30 April 2027", "30/04/2027", "30-4-2027" or "2027-04-30". Day first,
 * as India writes it. A plain text field, as the board draws it (the repo
 * bans native date inputs and this package can't use @saroh/ui's picker).
 */
export function readDate(text: string): string | null {
    const t = text.trim().toLowerCase().replace(/,/g, " ");
    let y: number, m: number, d: number;
    let g = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (g) [y, m, d] = [Number(g[1]), Number(g[2]), Number(g[3])];
    else if ((g = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)))
        [d, m, y] = [Number(g[1]), Number(g[2]), Number(g[3])];
    else if ((g = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/.exec(t))) {
        d = Number(g[1]);
        m = MONTHS.indexOf((g[2] ?? "").slice(0, 3)) + 1;
        y = Number(g[3]);
    } else return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (!m || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
        return null;
    return date.toISOString().slice(0, 10);
}

/** A local date as "2026-10-26", to compare with a date field's value. */
export function isoDay(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The voucher's big line: "₹2,000", the service, or a gap. */
export function worth(kind: Kind, amount: string, service: string): string {
    if (kind === "service") return service.trim() || "[service]";
    const n = readNumber(amount);
    return n ? rupee(n) : "[amount]";
}

export const WORDS = {
    form: "Your gift voucher",
    biz: "Business name",
    kind: "The voucher is for",
    amount: "Amount",
    amountHint:
        "Or pick “A service” to name one, like “Hair spa and blow-dry”.",
    amountBad: "Type the amount in rupees, like 2,000.",
    service: "Service",
    noService:
        "Say what the voucher is for: a service, or switch to an amount.",
    to: "For",
    from: "From",
    code: "Voucher code",
    newCode: "New code",
    codeHint:
        "Made in your browser. Write it in your register; this tool doesn't track who used it.",
    until: "Valid until",
    untilHint: "Six months is common. Type a date, or leave it open.",
    untilBad: "Type a date like 30 Apr 2027.",
    past: (today: string) =>
        `That date has passed. Pick a date after today, ${today}.`,
    phone: "Phone for bookings",
    terms: "Small print",
    out: "Your voucher",
    eyebrow: "Gift voucher",
    amountLine: "To spend on any service",
    serviceLine: "One visit",
    open: "No end date",
    caption: "Prints at 210 × 99 mm, three to an A4 sheet.",
    emptyCaption: "Add an amount or a service to fill it in.",
    gate: "Get your voucher",
    gateButton: "Get my voucher",
    gateAfter:
        "Print it three to an A4 sheet, or save it as a PDF to send on WhatsApp.",
    print: "Print or save as PDF",
} as const;
