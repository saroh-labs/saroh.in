import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import { modeSays, rateSays } from "@/lib/gst/item-words";
import { ITEM_MODE_LABEL } from "@/lib/gst/price-mode";

/**
 * Price history (owner, 12 Oct 2026), as it is said: what a product, one of
 * its options, a service or a course has cost, each change with who made it
 * and when. Pure and client-safe.
 *
 * The API keeps one entry per save (`audit/price-history.ts`): the typed
 * price, the MRP, the GST rate and "GST on this price", each as it was and
 * as it became. A price here is the one that was typed. Nothing works out
 * an amount to pay, so a line reads the same whatever the business's GST
 * setting is today (`backend-data-and-money.md` → One figure, one kind).
 *
 * The item's own section says each change as a short line ("Price ₹780 →
 * ₹820"); Settings › Activity says the same change as a sentence
 * (`lib/settings/activity-prices.ts`).
 */

export const PRICE_FIELDS = [
    "price",
    "mrp",
    "gstRate",
    "gstPriceMode",
] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

export function isPriceField(field: unknown): field is PriceField {
    return (
        typeof field === "string" &&
        (PRICE_FIELDS as readonly string[]).includes(field)
    );
}

/** One field as it was and as it became; null is "none". */
export interface PriceChange {
    field: string;
    before: string | null;
    after: string | null;
}

/** One row of an item's `/price-history` read. */
export interface PriceHistoryEntry {
    id: string;
    at: string;
    /** The item's first entry: it started at these values. */
    first: boolean;
    /** Null: someone no longer here. */
    who: { name: string | null; operator?: true; system?: true } | null;
    /** The option the change was to; null for the item itself. */
    option: string | null;
    currency: string | null;
    /** How it was made: "editor", "rates", "import", "copy", "setup". */
    source: string | null;
    changes: PriceChange[];
}

export interface PriceHistoryPage {
    entries: PriceHistoryEntry[];
    /** There are older entries than these. */
    nextCursor: string | null;
}

/** What a money field is called at the start of a line. */
const MONEY_LABEL = { price: "Price", mrp: "MRP" } as const;

/**
 * One change as a short line: "Price ₹780 → ₹820", "MRP set to ₹1,000",
 * "GST rate 5% → 18%", "GST on this price: includes GST → GST is added".
 * Null for a field this page doesn't know, or one that didn't move.
 *
 * `first` is the item's first entry, whose price reads "set at". `option`
 * is a product's option: with no price or MRP of its own it takes the
 * product's, so losing one reads "the same as the product".
 */
export function changeLine(
    change: PriceChange,
    context: { currency: string | null; first?: boolean; option?: boolean },
): string | null {
    const { before, after } = change;
    if (!isPriceField(change.field) || before === after) return null;
    const money = (amount: string) =>
        formatMoneyMajor(amount, context.currency);
    switch (change.field) {
        case "price":
        case "mrp": {
            const label = MONEY_LABEL[change.field];
            if (after === null) {
                return context.option
                    ? `${label} now the same as the product`
                    : `${label} removed`;
            }
            if (before === null) {
                return context.first && change.field === "price"
                    ? `${label} set at ${money(after)}`
                    : `${label} set to ${money(after)}`;
            }
            return `${label} ${money(before)} → ${money(after)}`;
        }
        case "gstRate":
            return before === null
                ? `GST rate set to ${rateSays(after)}`
                : `GST rate ${rateSays(before)} → ${rateSays(after)}`;
        case "gstPriceMode":
            return context.first
                ? `${ITEM_MODE_LABEL}: ${modeSays(after)}`
                : `${ITEM_MODE_LABEL}: ${modeSays(before)} → ${modeSays(after)}`;
    }
}

/** Who made an entry, as the row names them. */
export function entryWho(entry: Pick<PriceHistoryEntry, "who">): string {
    if (!entry.who) return "Someone no longer here";
    if (entry.who.operator) return "Saroh support";
    if (entry.who.system) return "Saroh";
    // A blank name is no name.
    const name = entry.who.name?.trim();
    if (name) return name;
    return "A team member";
}

/** How an entry was made, when that is worth a word after the name. */
const SOURCE_SAYS: Partial<Record<string, string>> = {
    import: "by import",
    copy: "as a copy",
};

/** One entry as the item's section draws it. */
export interface PriceHistoryRow {
    id: string;
    /** "12 Oct" this year, "12 Oct 2025" otherwise, in the business's zone. */
    date: string;
    /** "Asha", "Asha, by import", "Saroh support". */
    who: string;
    /** One line per field that changed; an option's start with its name. */
    lines: string[];
}

/**
 * The entries as rows, newest first as they came. An entry with nothing
 * this page can say (every field unknown) is left out.
 */
export function priceHistoryRows(
    entries: readonly PriceHistoryEntry[],
    timeZone: string,
    now: Date = new Date(),
): PriceHistoryRow[] {
    return entries.flatMap((entry): PriceHistoryRow[] => {
        const lines = entry.changes.flatMap((change) => {
            const line = changeLine(change, {
                currency: entry.currency,
                first: entry.first,
                option: entry.option !== null,
            });
            if (!line) return [];
            return [entry.option ? `${entry.option}: ${line}` : line];
        });
        if (lines.length === 0) return [];
        const how = SOURCE_SAYS[entry.source ?? ""];
        return [
            {
                id: entry.id,
                date: formatDate(entry.at, timeZone, { now }),
                who: how ? `${entryWho(entry)}, ${how}` : entryWho(entry),
                lines,
            },
        ];
    });
}

/** How many rows the section shows before "Show all". */
export const PRICE_HISTORY_SHORT = 5;

/** The section's name on every screen. */
export const PRICE_HISTORY_TITLE = "Price history";

/**
 * Whether a screen draws the section at all, heading included: it couldn't
 * be read (`null`, and the section says so), or there is something to
 * show. An item made before history was kept has none, and nothing is
 * drawn for it. `undefined` is a screen that didn't ask (a new item).
 */
export function priceHistoryShown(
    history: PriceHistoryPage | null | undefined,
): history is PriceHistoryPage | null {
    if (history === undefined) return false;
    return history === null || history.entries.length > 0;
}
