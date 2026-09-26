/**
 * Stock in words, for every screen that shows it — the Stock screen, the
 * products list's quick look, the product page (#514). Pure and client-safe.
 * The API does the arithmetic (on hand, promised, can sell, short); these
 * only say it, the same way everywhere.
 */

/** What a shelf says to the shop, as the API reads it. */
export type LevelWord = "IN_STOCK" | "LOW" | "SOLD_OUT" | "NOT_SOLD_HERE";

/** One storefront's shelf of one product or variant. */
export interface StockCell {
    storeId: string;
    stockLevelId: string | null;
    /** The storefront sells it; false reads "Not sold here". */
    soldHere: boolean;
    onHand: number;
    promised: number;
    canSell: number;
    short: number;
    warnAt: number;
    word: LevelWord;
    lastChange: LastChange | null;
}

/** The latest entry on a shelf. */
export interface LastChange {
    at: string;
    kind: StockEntryKind;
    quantity: number;
    /** Who made it — null for a role that doesn't read the audit trail. */
    by?: string | null;
    /** The order behind it — null for a role that doesn't read orders. */
    order?: { id: string; number: string } | null;
}

export type StockEntryKind =
    | "SOLD"
    | "RETURNED"
    | "BAKED"
    | "RECEIVED"
    | "WASTED"
    | "COUNTED"
    | "MOVED"
    | "REVERSED";

/** How a word is drawn: which colour role its pill takes. */
export type LevelTone = "ok" | "warn" | "danger" | "muted";

export interface LevelLabel {
    label: string;
    tone: LevelTone;
}

type Shelf = Pick<
    StockCell,
    "soldHere" | "onHand" | "promised" | "canSell" | "short" | "warnAt" | "word"
>;

/** "4 can sell". */
export function canSellWords(canSell: number): string {
    return `${Math.max(0, canSell)} can sell`;
}

/** "2 short", or null while the shelf covers what is promised. */
export function shortWords(shelf: Pick<Shelf, "short">): string | null {
    return shelf.short > 0 ? `${shelf.short} short` : null;
}

/** "Warns at 8", or null when it never warns. */
export function warnsAtWords(shelf: Pick<Shelf, "warnAt">): string | null {
    return shelf.warnAt > 0 ? `Warns at ${shelf.warnAt}` : null;
}

/** "Not sold here", with what is still on its shelf. */
export function notSoldHereWords(onHand: number): string {
    return onHand > 0 ? `Not sold here · ${onHand} on hand` : "Not sold here";
}

/**
 * The one label a shelf gets: not sold here, short (promised units that
 * aren't on the shelf come first — someone has to act), sold out, low, or
 * what it can sell.
 */
export function levelLabel(shelf: Shelf): LevelLabel {
    if (!shelf.soldHere || shelf.word === "NOT_SOLD_HERE") {
        return { label: notSoldHereWords(shelf.onHand), tone: "muted" };
    }
    const short = shortWords(shelf);
    if (short) return { label: short, tone: "danger" };
    if (shelf.word === "SOLD_OUT") return { label: "Sold out", tone: "danger" };
    if (shelf.word === "LOW") {
        return { label: `Low · ${canSellWords(shelf.canSell)}`, tone: "warn" };
    }
    return { label: canSellWords(shelf.canSell), tone: "ok" };
}

/** What customers see: "In stock", "Only 2 left", "Sold out". */
export function customersSee(shelf: Shelf): string {
    if (!shelf.soldHere || shelf.word === "NOT_SOLD_HERE") {
        return "Not sold here";
    }
    if (shelf.word === "SOLD_OUT") return "Sold out";
    if (shelf.word === "LOW") return `Only ${shelf.canSell} left`;
    return "In stock";
}

/**
 * One line across storefronts, sold-out first: "Sold out at Online · 4 at
 * Hill Road". Storefronts that don't sell it are left out; null when none
 * does.
 */
export function acrossStorefronts(
    cells: readonly (Shelf & { storeId: string })[],
    names: Readonly<Record<string, string>>,
): string | null {
    const sold = cells.filter((c) => c.soldHere && c.word !== "NOT_SOLD_HERE");
    if (sold.length === 0) return null;
    const name = (c: { storeId: string }) => names[c.storeId] ?? "a storefront";
    const out = sold.filter((c) => c.canSell <= 0);
    const selling = sold.filter((c) => c.canSell > 0);
    return [
        ...out.map((c) => `Sold out at ${name(c)}`),
        ...selling.map((c) => `${c.canSell} at ${name(c)}`),
    ].join(" · ");
}

/** A signed change as the log shows it: "+5", "−2", "0". */
export function signed(quantity: number): string {
    if (quantity > 0) return `+${quantity}`;
    if (quantity < 0) return `−${Math.abs(quantity)}`;
    return "0";
}

// ---- Counting ----

/** "Log says 12" — what the counter is shown. */
export function logSays(onHand: number): string {
    return `Log says ${onHand}`;
}

/** A count against what the log says: "Matches the log", "+2 against the log". */
export function againstTheLog(logSaid: number, counted: number): string {
    const diff = counted - logSaid;
    return diff === 0 ? "Matches the log" : `${signed(diff)} against the log`;
}

export type CountInput =
    | { kind: "skip" }
    | { kind: "count"; value: number }
    | { kind: "invalid"; error: string };

/**
 * A count box: empty is skipped, a whole number 0 or more counts, anything
 * else — "1.5", "-2", "ten" — says why and keeps Save count off.
 */
export function readCount(raw: string): CountInput {
    const text = raw.trim();
    if (text === "") return { kind: "skip" };
    if (!/^\d+$/.test(text)) {
        return { kind: "invalid", error: "Whole numbers only." };
    }
    return { kind: "count", value: Number(text) };
}

/** "Count saved: 3 counted, 1 changed." */
export function countSaved(counted: number, changed: number): string {
    return `Count saved: ${counted} counted, ${changed} changed.`;
}

// ---- Toasts ----

/** "Moved 3 to Online." */
export function movedWords(units: number, to: string): string {
    return `Moved ${units} to ${to}.`;
}

/** "Added 5 to Sourdough — 12 can sell now". */
export function addedWords(
    units: number,
    what: string,
    canSell: number,
): string {
    return `Added ${units} to ${what} — ${canSell} can sell now`;
}
