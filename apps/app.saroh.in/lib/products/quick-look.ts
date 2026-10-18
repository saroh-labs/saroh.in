import { acrossStorefronts } from "@/lib/stock/levels";

import type { CatalogueRow } from "./catalogue";
import type { NeedDetail } from "./needs-you";
import { optionWord } from "./needs-you";
import type { ListStock } from "./service";

/**
 * The Products list's quick look (#520), pure: a row's stock as the drawer
 * shows it — can sell, on hand, promised and short, per variant and in all,
 * across the storefronts in view — from what the catalogue read already
 * carries, so opening it costs no extra call. Client-safe.
 */

/** One line of the drawer's stock: a variant, or the product as a whole. */
export interface QuickShelf {
    /** The variant, or null while the product counts as a whole. */
    variantId: string | null;
    title: string;
    onHand: number;
    promised: number;
    canSell: number;
    short: number;
    warnAt: number;
    /** The storefronts in view that sell it, for "+N · Add". */
    storeIds: string[];
}

export interface QuickStock {
    /** False: nothing in view counts stock (Track stock off). */
    tracked: boolean;
    shelves: QuickShelf[];
    total: { onHand: number; promised: number; canSell: number; short: number };
}

function add(into: QuickShelf, stock: ListStock, storeId: string) {
    into.onHand += stock.quantity;
    into.promised += stock.promised;
    into.canSell += Math.max(0, stock.quantity - stock.promised);
    into.short += Math.max(0, stock.promised - Math.max(0, stock.quantity));
    into.warnAt = Math.min(into.warnAt, stock.lowStockAlert);
    if (!into.storeIds.includes(storeId)) into.storeIds.push(storeId);
}

function blank(variantId: string | null, title: string): QuickShelf {
    return {
        variantId,
        title,
        onHand: 0,
        promised: 0,
        canSell: 0,
        short: 0,
        warnAt: Number.POSITIVE_INFINITY,
        storeIds: [],
    };
}

/**
 * The row's shelves at `storeId` (the storefront filter), or at every
 * storefront that sells it. Per variant once any shelf counts per variant;
 * otherwise one shelf for the product.
 */
export function quickStock(
    row: CatalogueRow,
    storeId: string | null,
): QuickStock {
    const places = storeId
        ? row.places.filter((p) => p.storeId === storeId)
        : row.places;
    const perVariant = places.some((p) =>
        p.variants.some((v) => v.inventory !== null),
    );
    const titles = new Map(row.variants.map((v) => [v.id, v.title]));
    let shelves: QuickShelf[];
    if (perVariant) {
        const byVariant = new Map<string, QuickShelf>();
        for (const place of places) {
            for (const v of place.variants) {
                if (!v.soldHere || !v.inventory) continue;
                const title = titles.get(v.variantId) ?? "";
                const shelf =
                    byVariant.get(v.variantId) ??
                    blank(v.variantId, title.length > 0 ? title : row.name);
                add(shelf, v.inventory, place.storeId);
                byVariant.set(v.variantId, shelf);
            }
        }
        shelves = Array.from(byVariant.values());
    } else {
        const whole = blank(null, row.name);
        for (const place of places) {
            if (place.inventory) add(whole, place.inventory, place.storeId);
        }
        shelves = whole.storeIds.length > 0 ? [whole] : [];
    }
    shelves = shelves.map((s) => ({
        ...s,
        warnAt: Number.isFinite(s.warnAt) ? s.warnAt : 0,
    }));
    const total = shelves.reduce(
        (t, s) => ({
            onHand: t.onHand + s.onHand,
            promised: t.promised + s.promised,
            canSell: t.canSell + s.canSell,
            short: t.short + s.short,
        }),
        { onHand: 0, promised: 0, canSell: 0, short: 0 },
    );
    return { tracked: shelves.length > 0, shelves, total };
}

/** "0 can sell · 4 on hand · 6 promised". */
export function stockLine(t: QuickStock["total"]): string {
    return (
        `${t.canSell} can sell · ${t.onHand} on hand` +
        (t.promised ? ` · ${t.promised} promised` : "")
    );
}

/**
 * The drawer's headline: what can be sold, and the exception Needs you
 * names — "167 can sell · 1 of 28 shades out" — so the one shade that's
 * out is said before anyone scrolls to it. Without one, `stockLine`.
 */
export function stockHeadline(
    t: QuickStock["total"],
    need: NeedDetail | null,
): string {
    const worst = need?.variants?.worst ?? 0;
    const of = need?.variants?.of ?? 0;
    if (need && need.kind !== "short" && need.where?.length && worst > 0) {
        return (
            `${t.canSell} can sell · ${worst} of ${of} ` +
            `${optionWord(need.option, of)} ${need.kind === "out" ? "out" : "low"}`
        );
    }
    return stockLine(t);
}

/** A shelf's line: "2 short · 1 on hand, 3 promised" or "12 can sell · 12 on hand". */
export function shelfLine(s: QuickShelf): string {
    if (s.short > 0) {
        return `${s.short} short · ${s.onHand} on hand, ${s.promised} promised`;
    }
    return (
        `${s.canSell} can sell · ${s.onHand} on hand` +
        (s.promised ? `, ${s.promised} promised` : "")
    );
}

/** Danger when short or nothing to sell; the accent at its warning level. */
export function shelfTone(
    s: Pick<QuickShelf, "short" | "canSell" | "warnAt">,
): "danger" | "warn" | "muted" {
    if (s.short > 0 || s.canSell <= 0) return "danger";
    if (s.warnAt > 0 && s.canSell <= s.warnAt) return "warn";
    return "muted";
}

/** "2 short for orders already placed." — the drawer's alert. */
export function shortTitle(short: number): string {
    return `${short} short for orders already placed.`;
}

/**
 * Each variant shows when there are several, or one is short; and someone
 * who counts stock always gets the Add row, even for a product with one
 * shelf — Restock lands here, so it must be able to add.
 */
export function showShelves(stock: QuickStock, canStock = false): boolean {
    return (
        stock.shelves.length > 1 ||
        stock.total.short > 0 ||
        (canStock && stock.shelves.length === 1)
    );
}

/** Short first, then nothing to sell, then low; the rest after. */
function needRank(s: QuickShelf): number {
    if (s.short > 0) return 0;
    if (s.canSell <= 0) return 1;
    if (s.warnAt > 0 && s.canSell <= s.warnAt) return 2;
    return 3;
}

/** Whether a shelf needs someone (short, out or low). */
export function shelfNeeds(s: QuickShelf): boolean {
    return needRank(s) < 3;
}

/**
 * The shelves that need someone first (short, out, low), then the rest in
 * the catalogue's order — a 26th shade that's out isn't below the fold.
 */
export function orderShelves(shelves: readonly QuickShelf[]): QuickShelf[] {
    return shelves
        .map((s, i) => ({ s, i }))
        .sort((a, b) => needRank(a.s) - needRank(b.s) || a.i - b.i)
        .map(({ s }) => s);
}

/** Healthy shelves shown before "Show all 28 shades". */
export const HEALTHY_SHOWN = 6;

/**
 * The shelves the drawer shows: every one that needs someone, and the
 * first six healthy ones until it is opened; `hidden` is how many wait.
 */
export function foldShelves(
    ordered: readonly QuickShelf[],
    open: boolean,
): { shown: QuickShelf[]; hidden: number } {
    const needing = ordered.filter(shelfNeeds);
    const healthy = ordered.filter((s) => !shelfNeeds(s));
    if (open || healthy.length <= HEALTHY_SHOWN) {
        return { shown: [...ordered], hidden: 0 };
    }
    return {
        shown: [...needing, ...healthy.slice(0, HEALTHY_SHOWN)],
        hidden: healthy.length - HEALTHY_SHOWN,
    };
}

/**
 * "Sold out at Online · 4 at Hill Road" — only while more than one
 * storefront sells it and it counts stock; null otherwise.
 */
export function storefrontsLine(row: CatalogueRow): string | null {
    const counted = row.places.filter((p) => p.inventory !== null);
    if (row.places.length < 2 || counted.length === 0) return null;
    const names = Object.fromEntries(
        row.places.map((p) => [p.storeId, p.storeName]),
    );
    return acrossStorefronts(
        counted.map((p) => {
            const inv = p.inventory ?? {
                quantity: 0,
                promised: 0,
                lowStockAlert: 0,
            };
            const canSell = Math.max(0, inv.quantity - inv.promised);
            return {
                storeId: p.storeId,
                soldHere: true,
                onHand: inv.quantity,
                promised: inv.promised,
                canSell,
                short: Math.max(0, inv.promised - inv.quantity),
                warnAt: inv.lowStockAlert,
                word:
                    canSell <= 0
                        ? ("SOLD_OUT" as const)
                        : ("IN_STOCK" as const),
            };
        }),
        names,
    );
}

/** "3 of 12": where the drawer is in the list, or "" when it isn't in it. */
export function position(index: number, total: number): string {
    return index < 0 ? "" : `${index + 1} of ${total}`;
}

/**
 * J/K and the arrows: the next or previous product, staying put at either
 * end (the list doesn't wrap).
 */
export function step(index: number, by: 1 | -1, length: number): number {
    if (length === 0) return -1;
    const next = index + by;
    if (next < 0 || next >= length) return index;
    return next;
}

/** "+N" in the Add box: whole units over 0, or null (Add stays off). */
export function readAdd(raw: string): number | null {
    const text = raw.trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n > 0 ? n : null;
}

/**
 * Whether the business's online shop is live: true, false, or null when
 * the website couldn't be read. Words about the website say it only when
 * true; "unknown" claims neither.
 */
export type SellsOnline = boolean | null;

/**
 * The one true line under Archive, Publish or Sell again, in the quick
 * look's menu. Only claims the website when the online shop is live.
 */
export function sellLine(selling: boolean, online: SellsOnline): string {
    if (selling) {
        return online === true
            ? "Hides it from your website and the counter. Nothing is deleted."
            : online === false
              ? "Takes it off sale at the counter. Nothing is deleted."
              : "Takes it off sale. Nothing is deleted.";
    }
    return online === true
        ? "Shows it on your website and at the counter."
        : online === false
          ? "Puts it on sale at the counter."
          : "Puts it on sale.";
}

/** The toast after Publish, Sell again or Archive: it echoes the state. */
export function statusToast(
    status: "PUBLISHED" | "ARCHIVED",
    names: readonly string[],
): string {
    const one = names.length === 1 ? names[0] : undefined;
    if (status === "ARCHIVED") {
        return one ? `Archived ${one}.` : `Archived ${names.length} products.`;
    }
    return one ? `${one} is live.` : `${names.length} products are live.`;
}
