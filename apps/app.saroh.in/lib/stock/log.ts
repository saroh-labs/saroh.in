/**
 * The Stock screen's Log and Checks in words (#521, after "Saroh Stock").
 * Pure and client-safe: the API sends the entries and checks, these group
 * and say them.
 */

import { localDateKey } from "@/lib/format/datetime";

import type { StockEntryKind } from "./levels";
import { signed } from "./levels";
import type { Tone } from "./screen";
import { dayWords, timeWords } from "./screen";

// ---- Filters ----

export const LOG_KINDS = [
    { id: "all", label: "Everything", kinds: null },
    { id: "in", label: "Baked and received", kinds: ["BAKED", "RECEIVED"] },
    { id: "out", label: "Sold and returned", kinds: ["SOLD", "RETURNED"] },
    { id: "moved", label: "Moved", kinds: ["MOVED"] },
    { id: "wasted", label: "Wasted", kinds: ["WASTED"] },
    { id: "counted", label: "Counted", kinds: ["COUNTED"] },
] as const satisfies readonly {
    id: string;
    label: string;
    kinds: readonly StockEntryKind[] | null;
}[];
export type LogKindId = (typeof LOG_KINDS)[number]["id"];

export function logKindId(value: string | undefined): LogKindId {
    return LOG_KINDS.find((k) => k.id === value)?.id ?? "all";
}

export function logKinds(id: LogKindId): StockEntryKind[] | undefined {
    const kinds = LOG_KINDS.find((k) => k.id === id)?.kinds;
    return kinds ? [...kinds] : undefined;
}

/** "Both storefronts", or "All storefronts" past two. */
export function allStorefrontsWords(n: number): string {
    return n === 2 ? "Both storefronts" : "All storefronts";
}

// ---- Entries ----

export interface LogLine {
    id: string;
    kind: StockEntryKind;
    word: string;
    quantity: number;
    before: number;
    after: number;
    expected: number | null;
    mismatch: boolean;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    variantTitle: string | null;
    pairId: string | null;
    undone: boolean;
    note: string | null;
    createdAt: string;
    by: { id: string; name: string } | null;
    order: { id: string; number: string } | null;
}

/** The kind's pill: in is ok, wasted and a count that changed ask a look. */
export function entryTone(e: Pick<LogLine, "kind" | "quantity">): Tone {
    switch (e.kind) {
        case "BAKED":
        case "RECEIVED":
        case "RETURNED":
            return "ok";
        case "WASTED":
            return "warn";
        case "COUNTED":
            return e.quantity !== 0 ? "warn" : "muted";
        default:
            return "muted";
    }
}

/** "+12", "−2", "0", and its colour. */
export function entryQuantity(quantity: number): { text: string; tone: Tone } {
    return {
        text: signed(quantity),
        tone: quantity < 0 ? "danger" : quantity > 0 ? "ok" : "muted",
    };
}

/**
 * The note under who: what a count found, where a move went, the person's
 * own note, and whether it has been undone.
 */
export function entryNote(
    e: LogLine,
    /** The other half of a move, when it is on the page. */
    pair?: Pick<LogLine, "storeName"> | null,
): string {
    const parts: string[] = [];
    if (e.kind === "COUNTED") {
        if (e.mismatch && e.expected !== null) {
            parts.push(
                `Counted ${e.after} against ${e.expected} shown; the log said ${e.before}`,
            );
        } else {
            parts.push(
                e.quantity === 0
                    ? `Matched the log (${e.after})`
                    : `Log expected ${e.before}, counted ${e.after}`,
            );
        }
    } else if (e.kind === "MOVED") {
        parts.push(
            pair
                ? e.quantity < 0
                    ? `To ${pair.storeName}`
                    : `From ${pair.storeName}`
                : e.quantity < 0
                  ? "Moved out"
                  : "Moved in",
        );
    } else if (e.kind === "REVERSED") {
        parts.push("Undid an earlier change");
    }
    if (e.note) parts.push(e.note);
    if (e.undone) parts.push("Undone");
    return parts.join(" · ");
}

/** Who: "Order #1016", a person, or nothing the reader may see. */
export function entryWho(e: Pick<LogLine, "by" | "order">): string {
    if (e.order) return `Order #${e.order.number}`;
    return e.by?.name ?? "";
}

export interface LogDay<T> {
    key: string;
    label: string;
    rows: T[];
}

/** Newest first, grouped by the business's day: "Today", "Yesterday", "18 Sep". */
export function groupByDay<T extends { createdAt: string }>(
    entries: readonly T[],
    timeZone: string,
    now: Date = new Date(),
): LogDay<T>[] {
    const days: LogDay<T>[] = [];
    for (const e of entries) {
        const key = localDateKey(e.createdAt, timeZone);
        let day = days.find((d) => d.key === key);
        if (!day) {
            const words = dayWords(e.createdAt, timeZone, now);
            day = {
                key,
                label: words.charAt(0).toUpperCase() + words.slice(1),
                rows: [],
            };
            days.push(day);
        }
        day.rows.push(e);
    }
    return days;
}

/** "07:12". */
export const entryTime = timeWords;

/** "N entries", with "so far" while more pages wait. */
export function logCountWords(n: number, more: boolean): string {
    const words = `${n} ${n === 1 ? "entry" : "entries"}`;
    return more ? `${words} so far` : words;
}

// ---- Checks ----

export type CheckKind =
    "SHORT" | "COUNT_MISMATCH" | "SALE_NOT_TAKEN" | "PROMISED_MISMATCH";

export const CHECK_LABELS: Record<CheckKind, { label: string; tone: Tone }> = {
    SALE_NOT_TAKEN: { label: "Sale not taken from stock", tone: "danger" },
    COUNT_MISMATCH: { label: "Count didn't match", tone: "warn" },
    SHORT: { label: "Short for orders", tone: "danger" },
    PROMISED_MISMATCH: { label: "Promised doesn't add up", tone: "danger" },
};

export interface CheckLike {
    kind: CheckKind;
    detail: string;
    storeName: string;
    productName: string;
    variantTitle: string | null;
    numbers: Readonly<Record<string, number | undefined>>;
    order: { id: string; number: string } | null;
}

/** A check's headline and its sentence, in the design's shape. */
export function checkWords(c: CheckLike): { title: string; body: string } {
    const what = c.variantTitle
        ? `${c.productName} ${c.variantTitle}`
        : c.productName;
    switch (c.kind) {
        case "SHORT": {
            const n = c.numbers.short ?? 0;
            return {
                title: `${what} is ${n} short at ${c.storeName}`,
                body: `${c.numbers.promised ?? 0} promised to open orders, ${c.numbers.onHand ?? 0} on hand.`,
            };
        }
        case "COUNT_MISMATCH":
            return {
                title: `${c.storeName} counted ${what} against a number that had moved`,
                body: `${c.detail} Undo the count and count again, or mark it checked if the shelf is right.`,
            };
        case "SALE_NOT_TAKEN":
            return {
                title: c.order
                    ? `Order #${c.order.number} was fulfilled, but nothing left stock`
                    : "An order was fulfilled, but nothing left stock",
                body: `${c.detail} ${c.storeName}'s count will expect more than is on the shelf.`,
            };
        case "PROMISED_MISMATCH":
            return {
                title: `What ${c.storeName} has promised of ${what} doesn't match its orders`,
                body: c.detail,
            };
    }
}
