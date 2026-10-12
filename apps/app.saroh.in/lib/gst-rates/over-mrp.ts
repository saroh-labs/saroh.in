import { formatMoneyMajor } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

/**
 * Products over their MRP once GST is added (the owner, 12 Oct 2026: "GST
 * is part of MRP"). Pure and client-safe.
 *
 * An MRP includes all taxes, so the amount a customer pays for one, GST and
 * all, is never more than it. Switching the whole business to "GST is added
 * to my prices" adds GST to many prices at once, so before that is saved
 * the sheet says how many products (and options) would go over their MRP
 * and names the first few; the API refuses the switch while any would
 * (`GET …/gst-rates/over-mrp?mode=ADDED`, and the settings save's own
 * check). Going back to "My prices include GST" never needs this.
 */

/** One product, or one option of it, over its MRP. */
export interface OverMrpItem {
    productId: string;
    name: string;
    /** The option it is about ("Large"); null for the product's own price. */
    option: string | null;
    currency: string;
    /** The typed price, the amount to pay for one, and the MRP, × 100. */
    listCents: number;
    payCents: number;
    mrpCents: number;
    /** The rate GST is added at: "18". */
    rate: string | null;
}

/** `GET …/gst-rates/over-mrp`. */
export interface OverMrpRead {
    registered: boolean;
    /** Products with their own price, or any option, over the MRP. */
    products: number;
    /** Options over their MRP, across those products. */
    options: number;
    /** The first few, by product name. */
    items: OverMrpItem[];
    /** More are over than `items` lists. */
    more: boolean;
}

/** Narrows the read's body; anything else is "couldn't tell". */
export function overMrpOf(body: unknown): OverMrpRead | null {
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (
        typeof b.registered !== "boolean" ||
        typeof b.products !== "number" ||
        !Array.isArray(b.items)
    ) {
        return null;
    }
    const items = b.items.flatMap((raw): OverMrpItem[] => {
        const i = (raw ?? {}) as Partial<Record<keyof OverMrpItem, unknown>>;
        if (
            typeof i.productId !== "string" ||
            typeof i.name !== "string" ||
            typeof i.payCents !== "number" ||
            typeof i.mrpCents !== "number"
        ) {
            return [];
        }
        return [
            {
                productId: i.productId,
                name: i.name,
                option: typeof i.option === "string" ? i.option : null,
                currency: typeof i.currency === "string" ? i.currency : "INR",
                listCents: typeof i.listCents === "number" ? i.listCents : 0,
                payCents: i.payCents,
                mrpCents: i.mrpCents,
                rate: typeof i.rate === "string" ? i.rate : null,
            },
        ];
    });
    return {
        registered: b.registered,
        products: b.products,
        options: typeof b.options === "number" ? b.options : 0,
        items,
        more: b.more === true,
    };
}

/** How many the sheet names; the rest are counted. */
export const OVER_MRP_NAMED = 5;

const money = (cents: number, currency: string) =>
    formatMoneyMajor((cents / 100).toFixed(2), currency);

/** "Face cream (Large): ₹1,180 to pay, MRP ₹1,100". */
export function overMrpRow(item: OverMrpItem): string {
    const name = item.option ? `${item.name} (${item.option})` : item.name;
    return `${name}: ${money(item.payCents, item.currency)} to pay, MRP ${money(item.mrpCents, item.currency)}`;
}

/** What the sheet says under "GST is added to my prices". */
export interface OverMrpWords {
    /** How many would go over, in a sentence. */
    title: string;
    /** The first few, one per line. */
    rows: string[];
    /** "and 4 more", or null when every one is named. */
    rest: string | null;
    /** The way out. */
    fix: string;
}

/**
 * The notice for a business choosing "GST is added". `switching` is false
 * when that is already its saved way: the same list is then what is over
 * as things stand, to be put right. Null when nothing is over, or the read
 * couldn't tell: nothing is drawn, and the API's own check still stands.
 */
export function overMrpWords(
    read: OverMrpRead | null,
    switching: boolean,
): OverMrpWords | null {
    if (!read || read.products <= 0 || read.items.length === 0) return null;
    const one = read.products === 1;
    const products = count(read.products, "product");
    const options =
        read.options > 0 ? ` (${count(read.options, "option")})` : "";
    const rows = read.items.slice(0, OVER_MRP_NAMED).map(overMrpRow);
    const left = read.items.length - rows.length;
    return {
        title: switching
            ? `With GST added, ${products}${options} would cost more than ${one ? "its" : "their"} MRP.`
            : `With GST added, ${products}${options} ${one ? "costs" : "cost"} more than ${one ? "its" : "their"} MRP.`,
        rows,
        rest: read.more ? "and more" : left > 0 ? `and ${left} more` : null,
        fix: switching
            ? `An MRP includes GST, so this can't be saved yet. Lower the price or raise the MRP on ${one ? "it" : "each"}, or set ${one ? "it" : "each one"} to "Includes GST" in the product's Basics.`
            : `An MRP includes GST. Lower the price or raise the MRP on ${one ? "it" : "each"}, or set ${one ? "it" : "each one"} to "Includes GST" in the product's Basics. ${one ? "It sells" : "They sell"} at the amount to pay until then, with no saving shown.`,
    };
}
