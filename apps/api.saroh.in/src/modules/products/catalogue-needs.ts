import { shortBy } from "../stock/stock-words";

/**
 * The Products list's "Needs you" (#519), pure: a product's shelves added
 * up the way its list row adds them, and why it needs someone.
 */

/** A product someone should restock, and why. */
export interface CatalogueNeed {
    productId: string;
    name: string;
    /** Short for orders placed; nothing left to sell; at its warning level. */
    kind: "short" | "out" | "low";
    /** Promised units that aren't on the shelf. */
    short: number;
    canSell: number;
}

export interface NeedShelf {
    productId: string;
    name: string;
    onHand: number;
    promised: number;
    lowStockAlert: number;
}

/**
 * Pure: a product's shelves added up, as the list row adds them. Short
 * first (someone was promised it), then nothing left, then at or under its
 * warning level (a level of 0 never warns); by name within each.
 */
export function needsFrom(shelves: readonly NeedShelf[]): CatalogueNeed[] {
    const byProduct = new Map<
        string,
        { name: string; canSell: number; short: number; warnAt: number }
    >();
    for (const s of shelves) {
        const had = byProduct.get(s.productId) ?? {
            name: s.name,
            canSell: 0,
            short: 0,
            warnAt: Number.POSITIVE_INFINITY,
        };
        had.canSell += Math.max(0, s.onHand - s.promised);
        had.short += shortBy(s);
        had.warnAt = Math.min(had.warnAt, s.lowStockAlert);
        byProduct.set(s.productId, had);
    }
    const out: CatalogueNeed[] = [];
    for (const [productId, p] of byProduct) {
        const kind: CatalogueNeed["kind"] | null =
            p.short > 0
                ? "short"
                : p.canSell <= 0
                  ? "out"
                  : p.warnAt > 0 && p.canSell <= p.warnAt
                    ? "low"
                    : null;
        if (kind) {
            out.push({
                productId,
                name: p.name,
                kind,
                short: p.short,
                canSell: p.canSell,
            });
        }
    }
    const rank = { short: 0, out: 1, low: 2 } as const;
    return out.sort(
        (a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name),
    );
}
