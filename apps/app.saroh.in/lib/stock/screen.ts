/**
 * The Stock screen's words (#527, after "Saroh Stock"): the Levels table's
 * cells and rows, "Last change", counting, and the Move stock dialog. Pure
 * and client-safe; every number comes from the API (`lib/stock/service.ts`),
 * these only say it.
 */

import { localDateKey } from "@/lib/format/datetime";

import type { LastChange, StockCell } from "./levels";
import { readCount, signed } from "./levels";

export type Tone = "plain" | "ok" | "warn" | "danger" | "muted";

// ---- Levels ----

/**
 * A cell's headline, as the design draws it: short first (orders are
 * waiting on units that aren't there), then sold out, then what it can sell
 * — in the attention colour at or under its warning level.
 */
export function cellHead(
    cell: Pick<StockCell, "short" | "canSell" | "warnAt">,
): { text: string; tone: Tone } {
    if (cell.short > 0) return { text: `${cell.short} short`, tone: "danger" };
    if (cell.canSell <= 0) return { text: "Sold out", tone: "danger" };
    return {
        text: `${cell.canSell} can sell`,
        tone: cell.warnAt > 0 && cell.canSell <= cell.warnAt ? "warn" : "plain",
    };
}

/** "14 on hand · 4 promised". */
export function cellSub(cell: Pick<StockCell, "onHand" | "promised">): string {
    return `${cell.onHand} on hand · ${cell.promised} promised`;
}

/**
 * The line under a row's name: "800g · SD-800-L · warns at 6". The warning
 * level is the first storefront's that sells it; left out when it never
 * warns.
 */
export function rowSub(row: {
    variantTitle: string | null;
    sku: string | null;
    cells: readonly Pick<StockCell, "soldHere" | "warnAt">[];
}): string {
    const sold = row.cells.find((c) => c.soldHere);
    const warnAt = sold ? sold.warnAt : (row.cells.at(0)?.warnAt ?? 0);
    return [row.variantTitle, row.sku, warnAt > 0 ? `warns at ${warnAt}` : null]
        .filter(Boolean)
        .join(" · ");
}

/** A row's name with its variant: "Sourdough loaf 800g". */
export function rowName(row: {
    productName: string;
    variantTitle: string | null;
}): string {
    return row.variantTitle
        ? `${row.productName} ${row.variantTitle}`
        : row.productName;
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** "today", "yesterday" or "18 Sep" (with the year when not this one). */
export function dayWords(
    iso: string,
    timeZone: string,
    now: Date = new Date(),
): string {
    const key = localDateKey(iso, timeZone);
    const today = localDateKey(now, timeZone);
    if (key === today) return "today";
    if (key === localDateKey(new Date(now.getTime() - 86_400_000), timeZone)) {
        return "yesterday";
    }
    const [y, m, d] = key.split("-");
    const day = `${Number(d)} ${MONTHS[Number(m) - 1]}`;
    return y === today.slice(0, 4) ? day : `${day} ${y}`;
}

/** "07:12", 24-hour, in the business's zone. */
export function timeWords(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(iso));
}

/** "today at 07:12". */
export function atWords(
    iso: string,
    timeZone: string,
    now: Date = new Date(),
): string {
    return `${dayWords(iso, timeZone, now)} at ${timeWords(iso, timeZone)}`;
}

const KIND_WORDS: Record<LastChange["kind"], string> = {
    SOLD: "Sold",
    RETURNED: "Returned",
    BAKED: "Baked",
    RECEIVED: "Received",
    WASTED: "Wasted",
    COUNTED: "Counted",
    MOVED: "Moved",
    REVERSED: "Undone",
};

/**
 * "Counted by Arjun, today at 07:12", "Sold, Order #1016, yesterday at
 * 16:20". Who and which order only when the API sent them (they follow the
 * reader's role).
 */
export function lastChangeWords(
    change: LastChange | null,
    timeZone: string,
    now: Date = new Date(),
): string {
    if (!change) return "No changes logged yet";
    const when = atWords(change.at, timeZone, now);
    const word = KIND_WORDS[change.kind];
    if (change.order) return `${word}, Order #${change.order.number}, ${when}`;
    if (change.by) return `${word} by ${change.by}, ${when}`;
    return `${word}, ${when}`;
}

/**
 * The line under the title: "Rye & Co. · Hill Road and Online count
 * separately · every change is logged". One storefront, no counting apart.
 */
export function stockSubline(
    business: string | null | undefined,
    storefronts: readonly { name: string }[],
): string {
    const parts: string[] = [];
    if (business) parts.push(business);
    if (storefronts.length === 2) {
        parts.push(
            `${storefronts[0].name} and ${storefronts[1].name} count separately`,
        );
    } else if (storefronts.length > 2) {
        parts.push(`${storefronts.length} storefronts count separately`);
    }
    parts.push("every change is logged");
    return parts.join(" · ");
}

/** "2 products aren't tracked and always sell:". */
export function untrackedLine(n: number): string {
    return n === 1
        ? "1 product isn't tracked and always sells:"
        : `${n} products aren't tracked and always sell:`;
}

/** What an empty table says, by what narrowed it. */
export function noRowsWords(view: {
    needs: boolean;
    q: string;
    /** Nothing narrows the view: the business counts nothing yet. */
    all?: boolean;
}): string {
    if (view.needs && !view.q) {
        return "Nothing needs you. Every size has more than its warning level.";
    }
    if (view.q) return `No products match "${view.q}".`;
    return view.all
        ? "No product counts stock yet. Turn on Track stock in a product's editor to count it here."
        : "No products match.";
}

// ---- Counting ----

/** The count box of one shelf. */
export function countKey(
    row: { productId: string; variantId: string | null },
    storeId: string,
): string {
    return `${storeId}|${row.productId}|${row.variantId ?? ""}`;
}

export function parseCountKey(key: string): {
    storeId: string;
    productId: string;
    variantId: string | null;
} {
    const [storeId, productId, variantId] = key.split("|");
    return { storeId, productId, variantId: variantId || null };
}

/** Under a count box: "Log says 12", "Matches the log", "+2 against the log". */
export function countDiff(
    raw: string,
    logSaid: number,
): { text: string; tone: Tone } {
    const read = readCount(raw);
    if (read.kind === "skip")
        return { text: `Log says ${logSaid}`, tone: "muted" };
    if (read.kind === "invalid") return { text: read.error, tone: "danger" };
    const d = read.value - logSaid;
    return d === 0
        ? { text: "Matches the log", tone: "ok" }
        : { text: `${signed(d)} against the log`, tone: "warn" };
}

export interface CountDraft {
    /** Shelves with a whole number typed. */
    entered: {
        key: string;
        counted: number;
        expected: number;
    }[];
    /** Of those, how many differ from the log. */
    differ: number;
    /** Some box holds something that isn't a whole number. */
    bad: boolean;
    status: string;
}

/**
 * The count bar's reading of every box: "3 counted · 1 differ from the log",
 * "Whole numbers only.", or "Nothing counted yet."; `expected` is the "Log
 * says N" the counter was shown.
 */
export function countDraft(
    values: Readonly<Record<string, string>>,
    logSays: Readonly<Record<string, number>>,
): CountDraft {
    const entered: CountDraft["entered"] = [];
    let bad = false;
    for (const [key, raw] of Object.entries(values)) {
        const read = readCount(raw);
        if (read.kind === "invalid") bad = true;
        if (read.kind === "count" && key in logSays) {
            entered.push({ key, counted: read.value, expected: logSays[key] });
        }
    }
    const differ = entered.filter((e) => e.counted !== e.expected).length;
    return {
        entered,
        differ,
        bad,
        status: bad
            ? "Whole numbers only."
            : entered.length
              ? `${entered.length} counted · ${differ} differ from the log`
              : "Nothing counted yet.",
    };
}

// ---- Move stock ----

export interface MoveShelf {
    storeId: string;
    name: string;
    soldHere: boolean;
    onHand: number;
    promised: number;
    canSell: number;
    /** A shelf exists there. */
    has: boolean;
}

/**
 * Why a move can't be made yet, in the design's words, or null. What can
 * leave a storefront is what is on its shelf and not promised.
 */
export function moveProblem(input: {
    from: MoveShelf | undefined;
    to: MoveShelf | undefined;
    units: string;
}): string | null {
    const { from, to, units } = input;
    if (!from || !to) return "Pick where it comes from and where it goes.";
    if (from.storeId === to.storeId) return "Pick two different storefronts.";
    if (!from.has || from.onHand <= 0) {
        return `${from.name} has none of it on the shelf, so there's nothing to move.`;
    }
    const read = readCount(units);
    if (read.kind !== "count" || read.value < 1) {
        return "How many to move — a whole number.";
    }
    const spare = Math.max(0, from.onHand - Math.max(0, from.promised));
    if (read.value > spare) {
        return spare > 0
            ? `Only ${spare} can be moved from ${from.name}. The rest are promised to orders there.`
            : `None can be moved from ${from.name}. They are all promised to orders there.`;
    }
    return null;
}

/** "Hill Road has 10 to spare, Online has 6 on hand." */
export function moveNote(
    from: MoveShelf | undefined,
    to: MoveShelf | undefined,
): string {
    if (!from) return "";
    const spare = Math.max(0, from.onHand - Math.max(0, from.promised));
    const head = `${from.name} has ${spare} to spare`;
    if (!to || to.storeId === from.storeId) return `${head}.`;
    return to.has
        ? `${head}, ${to.name} has ${to.onHand} on hand.`
        : `${head}. ${to.name} will start counting it.`;
}

// ---- Entries ----

/** What the entries sheet records, and which way it moves the shelf. */
export const ENTRY_KINDS = [
    { kind: "RECEIVED", label: "Received", sign: 1 },
    { kind: "BAKED", label: "Baked", sign: 1 },
    { kind: "WASTED", label: "Wasted", sign: -1 },
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number]["kind"];

/** "Recorded 2 wasted — 10 on hand now." */
export function entrySaved(
    kind: EntryKind,
    units: number,
    onHand: number,
): string {
    const label = ENTRY_KINDS.find((k) => k.kind === kind)?.label ?? kind;
    return `Recorded ${units} ${label.toLowerCase()} — ${onHand} on hand now.`;
}

/**
 * Why an entry can't be saved yet, or null. Wasted can't take more than the
 * shelf holds (the API says so too, in its words).
 */
export function entryProblem(input: {
    kind: EntryKind;
    units: string;
    onHand: number | null;
}): string | null {
    const read = readCount(input.units);
    if (read.kind !== "count" || read.value < 1) {
        return "How many — a whole number, 1 or more.";
    }
    if (
        input.kind === "WASTED" &&
        input.onHand !== null &&
        read.value > input.onHand
    ) {
        return input.onHand > 0
            ? `Only ${input.onHand} on the shelf to waste.`
            : "Nothing on the shelf to waste.";
    }
    return null;
}
