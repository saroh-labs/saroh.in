import type { LineShelf } from "../stock/product-lines";
import { productLines } from "../stock/product-lines";
import type { ShelfNeed } from "../stock/stock-words";
import { movable, NEED_RANK, shortBy } from "../stock/stock-words";

/**
 * The Products list's "Needs you" (#519), pure. It judges each shelf the
 * way the Stock screen's "Needs you" does (`shelfNeed`, #527), so the two
 * agree on every product: a product needs someone when any shelf where it
 * is sold does, and why is its worst shelf's reason.
 */

/** A product someone should restock, and why. */
export interface CatalogueNeed {
    productId: string;
    name: string;
    /** Short for orders placed; nothing left to sell; at its warning level. */
    kind: ShelfNeed;
    /** Promised units that aren't on its shelves, wherever it is sold. */
    short: number;
    /** What can be sold from the shelves that are `kind`. */
    canSell: number;
    /**
     * Which shelves are `kind` — "Small at Online", "Online", "Small" —
     * when not every shelf where it is sold is; null when they all are.
     */
    where: string[] | null;
}

export interface NeedProduct {
    id: string;
    name: string;
    variants: readonly { id: string; title: string }[];
    listings: readonly {
        storeId: string;
        variants: readonly { variantId: string }[];
    }[];
    shelves: readonly LineShelf[];
}

const EMPTY = { onHand: 0, promised: 0 };

/**
 * Pure: every product that needs someone at `storefronts`, most urgent
 * first (short, then out, then low), by name within each.
 */
export function needsFrom(
    products: readonly NeedProduct[],
    storefronts: readonly { id: string; name: string }[],
): CatalogueNeed[] {
    const storeName = new Map(storefronts.map((s) => [s.id, s.name]));
    const out: CatalogueNeed[] = [];
    for (const p of products) {
        const lines = productLines(
            p,
            p.shelves,
            storefronts.map((s) => s.id),
        );
        const sold = lines.flatMap((l) =>
            l.cells
                .filter((c) => c.soldHere)
                .map((c) => ({ ...c, variantId: l.variantId })),
        );
        let kind: ShelfNeed | null = null;
        for (const c of sold) {
            if (c.need && (!kind || NEED_RANK[c.need] < NEED_RANK[kind])) {
                kind = c.need;
            }
        }
        if (!kind) continue;
        const worst = sold.filter((c) => c.need === kind);
        const title = new Map(p.variants.map((v) => [v.id, v.title]));
        const several = storefronts.length > 1;
        const label = (c: (typeof worst)[number]) =>
            [
                c.variantId ? title.get(c.variantId) : null,
                several ? storeName.get(c.storeId) : null,
            ]
                .filter(Boolean)
                .join(" at ");
        const where =
            worst.length < sold.length
                ? Array.from(new Set(worst.map(label))).filter(Boolean)
                : [];
        out.push({
            productId: p.id,
            name: p.name,
            kind,
            short: sold.reduce((n, c) => n + shortBy(c.shelf ?? EMPTY), 0),
            canSell: worst.reduce((n, c) => n + movable(c.shelf ?? EMPTY), 0),
            where: where.length > 0 ? where : null,
        });
    }
    return out.sort(
        (a, b) =>
            NEED_RANK[a.kind] - NEED_RANK[b.kind] ||
            a.name.localeCompare(b.name),
    );
}
