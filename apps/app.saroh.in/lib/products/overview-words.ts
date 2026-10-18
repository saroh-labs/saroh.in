import { WHO_CAN_CHANGE } from "@/lib/access/who-can-change";
import { count } from "@/lib/format/plural";
/**
 * The product page's Overview in words (#522), after "Saroh Product Detail":
 * the stock card and what is out, the Variants and Website cards, the
 * Details tags, the Customer view's notes and the access line. Pure and client-safe; the API does the
 * arithmetic, these only say it.
 */

import type { LogLike } from "@/lib/stock/product-stock";
import { weekLine } from "@/lib/stock/product-stock";

import type { ProductPlacement, StockLine } from "./overview-rules";

// ---- Availability ----

export interface Availability {
    /** More promised than is on some shelf: the card turns into an alert. */
    short: boolean;
    label: string;
    /** The big figure: what can be sold, or "N short". */
    figure: string;
    note: string;
}

/**
 * "To sell · 25 · 30 on hand, 5 promised" — or, when open orders hold more
 * than a shelf has, "Short for orders already placed · 2 short". `short`
 * is summed shelf by shelf: a surplus at one storefront doesn't cover a
 * gap at another. Archived, nothing is for sale: what is on hand, said so.
 */
export function availability(
    totals: {
        onHand: number;
        promised: number;
        canSell: number;
        short: number;
    },
    perStore: string | null = null,
    archived = false,
): Availability {
    if (archived) {
        return {
            short: false,
            label: "On hand",
            figure: String(totals.onHand),
            note: "Not for sale while it is archived",
        };
    }
    const note = `${totals.onHand} on hand, ${totals.promised} promised${
        perStore ? ` · ${perStore}` : ""
    }`;
    if (totals.short > 0) {
        return {
            short: true,
            label: "Short for orders already placed",
            figure: `${totals.short} short`,
            note,
        };
    }
    return {
        short: false,
        label: "To sell",
        figure: String(totals.canSell),
        note,
    };
}

/**
 * A variant's word, from the product's own option: "shade" and "shades"
 * for Shade, "variant" when it has none.
 */
export function optionNoun(
    optionName: string | null | undefined,
    n = 1,
): string {
    const named = optionName?.trim().toLowerCase();
    const one = named === undefined || named === "" ? "variant" : named;
    return n === 1 ? one : one.endsWith("s") ? one : `${one}s`;
}

/** The exception on the stock card: what is out or low, and which lines. */
export interface StockException {
    /** "7.44 is out · 2 low", "Sold out". */
    text: string;
    /** The variants it names, out first: the stock sheet lists them first. */
    variantIds: string[];
}

/**
 * What needs stock at the page's storefront, named: "7.44 is out",
 * "3 shades are out · 2 low"; for a product counted as a whole, "Sold
 * out" or "Low: 3 left". Short lines are the card's own alert, so they
 * are left to it. Null when nothing is out or low.
 */
export function stockException(
    stock: {
        mode: "product" | "variant";
        variants: readonly (StockLine & { variantId: string })[];
        product: StockLine | null;
    },
    titleOf: (variantId: string) => string,
    optionName: string | null | undefined,
): StockException | null {
    if (stock.mode === "product") {
        const l = stock.product;
        if (!l || l.promised > l.onHand) return null;
        if (l.word === "SOLD_OUT") return { text: "Sold out", variantIds: [] };
        if (l.word === "LOW") {
            return { text: `Low: ${l.canSell} left`, variantIds: [] };
        }
        return null;
    }
    const fine = (l: StockLine) => l.promised <= l.onHand;
    const out = stock.variants.filter((l) => fine(l) && l.word === "SOLD_OUT");
    const low = stock.variants.filter((l) => fine(l) && l.word === "LOW");
    if (out.length === 0 && low.length === 0) return null;
    const parts: string[] = [];
    if (out.length === 1 && out[0]) {
        parts.push(`${titleOf(out[0].variantId)} is out`);
    } else if (out.length > 1) {
        parts.push(
            `${out.length} ${optionNoun(optionName, out.length)} are out`,
        );
    }
    if (low.length === 1 && low[0] && out.length === 0) {
        parts.push(`${titleOf(low[0].variantId)} is low`);
    } else if (low.length > 0) {
        parts.push(`${low.length} low`);
    }
    return {
        text: parts.join(" · "),
        variantIds: [...out, ...low].map((l) => l.variantId),
    };
}

/**
 * The Variants card: "28 shades · ₹420 each · 1 out", "6 jars · ₹420 to
 * ₹490". The out count only for a product that counts each one.
 */
export function variantsLine(
    v: {
        count: number;
        optionName: string | null | undefined;
        min: string;
        max: string;
        /** Variants out at the page's storefront; null when not counted. */
        out: number | null;
    },
    money: (amount: string) => string,
): string {
    const price =
        v.min === v.max
            ? `${money(v.min)} each`
            : `${money(v.min)} to ${money(v.max)}`;
    return [
        `${v.count} ${optionNoun(v.optionName, v.count)}`,
        price,
        v.out ? `${v.out} out` : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

/** "10 at Hill Road, 15 online" — only when there is more than one. */
export function sellableByStore(
    stores: readonly { name: string; canSell: number }[],
): string | null {
    if (stores.length < 2) return null;
    return stores
        .map((s) =>
            s.name.trim().toLowerCase() === "online"
                ? `${s.canSell} online`
                : `${s.canSell} at ${s.name}`,
        )
        .join(", ");
}

/**
 * "5 held by 3 open orders — 800g 4, 400g 1": what the promised units are,
 * and which sizes hold them. Null when nothing is promised. With orders
 * unread, the number still stands — it comes from the product's shelves.
 */
export function heldByLine(
    promised: number,
    openOrders: number | null,
    bySize: readonly { title: string; promised: number }[],
): string | null {
    if (promised <= 0) return null;
    if (openOrders === null) {
        return `${promised} promised to open orders.`;
    }
    const sizes = bySize
        .filter((s) => s.promised > 0)
        .map((s) => `${s.title} ${s.promised}`)
        .join(", ");
    const held = `${promised} held by ${count(openOrders, "open order")}`;
    return sizes ? `${held}: ${sizes}` : held;
}

// ---- Orders, collections and the website ----

/** An order's reference as people say it: "#1020"; "ORD-507" as it is. */
export function orderRef(number: string): string {
    return /^\d+$/.test(number) ? `#${number}` : number;
}

/**
 * The collections it shows in now — a hand-picked one keeps an archived
 * product but doesn't show it. The Overview's card, the tab's count and
 * the Collections tab all count these (#524).
 */
export function shownCollections(
    placement: ProductPlacement,
): ProductPlacement["collections"] {
    return placement.collections.filter((c) => c.showing);
}

/**
 * The product's own page on the online shop, while both are live: the
 * shop's link (`web-address`'s `links.shop`, null until the shop is live)
 * and the product published. Null otherwise.
 */
export function shopProductUrl(
    shop: string | null | undefined,
    product: { status: string; slug?: string | null },
): string | null {
    if (!shop || product.status !== "PUBLISHED" || !product.slug) return null;
    return `${shop}/${encodeURIComponent(product.slug)}`;
}

/**
 * "Shown on 2 pages" and each page — or, until the website has a block
 * that shows products (#473), that it doesn't yet. A product live on the
 * online shop says so first (UX-082): it is on the website there, whatever
 * its pages show.
 */
export function websiteSummary(
    placement: ProductPlacement,
    onShop = false,
    shopLive: boolean | null = null,
): {
    headline: string;
    lines: string[];
} {
    const { showsProducts, pages } = placement.website;
    if (!onShop && shopLive === false) {
        return {
            headline: "Not online yet",
            lines: ["Your online shop isn't live yet."],
        };
    }
    if (onShop) {
        return pages.length === 0 || !showsProducts
            ? {
                  headline: "On the online shop",
                  lines: ["No other page of the website shows it."],
              }
            : {
                  headline: `On the online shop and ${count(pages.length, "page")}`,
                  lines: pages.map((p) => p.title || p.path),
              };
    }
    if (!showsProducts) {
        return {
            headline: "Not on the website",
            lines: ["The website doesn't show products yet."],
        };
    }
    if (pages.length === 0) {
        return {
            headline: "Not on any page",
            lines: ["No published page shows it or its collections."],
        };
    }
    return {
        headline: `Shown on ${count(pages.length, "page")}`,
        lines: pages.map((p) => p.title || p.path),
    };
}

// ---- Details ----

export type DetailTag =
    | "Shown online"
    | "Shown when online"
    | "Team only"
    | "Hidden until filled in";

/**
 * The tag beside a detail: whether customers see it. One the shop would
 * show but that is empty says so — "Hidden until filled in" — rather than
 * claiming it is shown. Until the online shop is live (`shopLive` false),
 * a shown one says "Shown when online": nobody sees it online yet.
 */
export function detailTag(
    filled: boolean,
    onShop: boolean,
    shopLive: boolean | null = null,
): DetailTag {
    if (!onShop) return "Team only";
    if (!filled) return "Hidden until filled in";
    return shopLive === false ? "Shown when online" : "Shown online";
}

/**
 * The Visibility row, as far as it truly reaches: live and on the
 * website, live at the counter only while the online shop isn't, a draft,
 * or archived. `shopLive` null: not known (a role that can't read the web
 * address), so nothing is claimed about the website.
 */
export function visibilityLine(
    status: "PUBLISHED" | "DRAFT" | "ARCHIVED",
    shopLive: boolean | null,
): string {
    if (status === "DRAFT") return "Draft. Only the team can see it";
    if (status === "ARCHIVED") {
        return "Archived. Not sold, and its page does not open";
    }
    if (shopLive === true) return "Live. Customers can buy it on your website";
    if (shopLive === false) return "Live. Sold at the counter. Not online yet.";
    return "Live. Customers can buy it";
}

/** What an empty detail reads. */
export const NOT_FILLED_IN = "Not filled in";

// ---- Who is looking ----

/**
 * The line under the header for anyone who can't change the product:
 * who they are signed in as, what they can do here, and who can change
 * that. Null for someone who can change it.
 */
export function accessLine(may: {
    roleLabel: string;
    canWrite: boolean;
    canStock: boolean;
    canReply: boolean;
}): string | null {
    if (may.canWrite) return null;
    const can = [
        may.canStock ? "change stock counts" : null,
        may.canReply ? "reply to and hide reviews" : null,
    ].filter((x): x is string => x !== null);
    const does = can.length
        ? `You can ${can.join(" and ")} here.`
        : "You can look, but not change anything.";
    return `You're signed in as ${may.roleLabel}. ${does} ${WHO_CAN_CHANGE}`;
}

/**
 * Where the product sells, for the header's line: its storefronts'
 * names while live, else that it isn't sold.
 */
export function whereItSells(
    status: "PUBLISHED" | "DRAFT" | "ARCHIVED",
    storefronts: readonly string[],
): string {
    if (status === "ARCHIVED") return "not sold";
    if (status === "DRAFT") return "not sold yet";
    return storefronts.length ? storefronts.join(", ") : "not sold anywhere";
}

// ---- Recent changes ----

/**
 * "This week: 0 sold, 0 received, 0 wasted, +167 at the first count." A
 * shelf's first count (from 0, the oldest entry the log holds for it) is
 * where the stock started, not a change nobody explained; later counts
 * that moved it still read "unexplained at counts". `entries` newest first.
 */
export function weekWords(
    entries: readonly (LogLike & {
        id: string;
        before: number;
        storeId: string;
        variantId: string | null;
    })[],
    now: Date,
): string {
    const firsts = new Set<string>();
    const seen = new Set<string>();
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const e = entries[i];
        const shelf = `${e.storeId}|${e.variantId ?? ""}`;
        if (seen.has(shelf)) continue;
        seen.add(shelf);
        if (e.kind === "COUNTED" && e.before === 0) firsts.add(e.id);
    }
    const since = now.getTime() - 7 * 86_400_000;
    const first = entries
        .filter((e) => firsts.has(e.id) && Date.parse(e.createdAt) >= since)
        .reduce((n, e) => n + e.quantity, 0);
    const line = weekLine(
        entries.filter((e) => !firsts.has(e.id)),
        now,
    );
    if (first === 0) return line;
    return `${line.replace(/\.$/, "")}, ${first > 0 ? "+" : "−"}${Math.abs(first)} at the first count.`;
}

// ---- Customer view ----

/**
 * The Customer view's Price note: one price for all — "₹420 for every
 * shade." — or the range, "₹420 to ₹490 across 6 jars." MRP is said struck
 * through only when the shop strikes it (a saving: MRP above the price).
 */
export function customerPriceNote(
    p: {
        price: string;
        variantPrices: readonly string[];
        optionName: string | null | undefined;
        mrp: string | null;
        savingPercent: number | null;
    },
    money: (amount: string) => string,
): string {
    const struck = p.mrp !== null && p.savingPercent !== null;
    if (p.variantPrices.length === 0) {
        return `${money(p.price)}${struck && p.mrp ? `, with MRP ${money(p.mrp)} struck through` : ""}.`;
    }
    const nums = p.variantPrices.map(Number);
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const at = (n: number) => p.variantPrices[nums.indexOf(n)] ?? p.price;
    const base =
        lo === hi
            ? `${money(at(lo))} for every ${optionNoun(p.optionName)}.`
            : `${money(at(lo))} to ${money(at(hi))} across ${p.variantPrices.length} ${optionNoun(p.optionName, p.variantPrices.length)}.`;
    return struck && p.mrp
        ? `${base} MRP ${money(p.mrp)} is shown struck through.`
        : base;
}

/**
 * The Customer view's stock note, as a customer meets it: "27 shades in
 * stock, 7.44 sold out." — the sold-out ones named while there are two or
 * fewer, counted past that.
 */
export function customerStockNote(
    lines: readonly { title: string; soldOut: boolean }[],
    optionName: string | null | undefined,
): string {
    const out = lines.filter((l) => l.soldOut);
    const inStock = lines.length - out.length;
    const noun = (n: number) => `${n} ${optionNoun(optionName, n)}`;
    if (out.length === 0) {
        return lines.length === 1
            ? "In stock."
            : `All ${noun(lines.length)} in stock.`;
    }
    if (inStock === 0) {
        return lines.length === 1
            ? "Sold out."
            : `All ${noun(lines.length)} sold out.`;
    }
    const named =
        out.length <= 2
            ? out.map((l) => l.title).join(" and ")
            : String(out.length);
    return `${noun(inStock)} in stock, ${named} sold out.`;
}

// ---- Collections ----

/**
 * The Collections tab's examples, from the business's own categories:
 * "a Hair colour section, a Shampoo list". Generic when it has none.
 */
export function collectionExamples(categories: readonly string[]): string {
    const [a, b] = categories.map((c) => c.trim()).filter(Boolean);
    if (a && b) return `a ${a} section, a ${b} list`;
    if (a) return `a ${a} section, a New this week list`;
    return "a section for one kind of product, a New this week list";
}
