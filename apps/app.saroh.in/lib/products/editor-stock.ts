import type { StockDraft } from "./editor-sections";
import type { ProductDetail } from "./service";

/**
 * How the Editor's Stock section reads a product's count (#525) — pure and
 * client-safe; tested in `editor-stock.test.ts`.
 */

/**
 * How the product is counted at this storefront:
 * - "variant" — each variant keeps its own count;
 * - "whole" — one count for the product, even when it has variants (an
 *   older shape: orders for any variant take from the one count);
 * - "none" — nothing counted yet.
 */
export type StockCounting = "variant" | "whole" | "none";

export function stockCounting(
    p: Pick<ProductDetail, "stockMode" | "inventory">,
): StockCounting {
    if (p.stockMode === "variant") return "variant";
    return p.inventory ? "whole" : "none";
}

/**
 * What the Stock section draws:
 * - "collapsed" — nothing counted, and no one has pressed Add stock;
 * - "whole" — the product's one count;
 * - "lines" — a count per variant.
 * `opened` is Add stock, or Count each variant for a product counted whole.
 */
export type StockLayout = "collapsed" | "whole" | "lines";

export function stockLayout(
    counting: StockCounting,
    hasVariants: boolean,
    opened: boolean,
): StockLayout {
    if (counting === "variant") return "lines";
    if (counting === "whole") return hasVariants && opened ? "lines" : "whole";
    if (!opened) return "collapsed";
    return hasVariants ? "lines" : "whole";
}

/**
 * Whether saving this layout changes how the product counts — the first
 * count per variant. The API asks `store:write` for that, so a stock-only
 * role can't (#515).
 */
export function switchesToVariants(
    counting: StockCounting,
    layout: StockLayout,
): boolean {
    return layout === "lines" && counting !== "variant";
}

/**
 * The section's values from the saved product. Moving to a count per
 * variant counts every unit once: the API moves each open order's promise
 * onto the variant it names, so each variant starts at what it promises,
 * and the first also takes what was free to sell. Lines naming no variant
 * stay promised on the product.
 */
export function stockDraftFrom(
    p: Pick<
        ProductDetail,
        "inventory" | "stockMode" | "variants" | "variantPromises"
    >,
    defaultWarn: string,
): StockDraft {
    const own = p.inventory;
    const perVariant = p.stockMode === "variant";
    const free = Math.max(0, (own?.quantity ?? 0) - (own?.reserved ?? 0));
    return {
        quantity: String(own?.quantity ?? 0),
        lowStockAlert: String(own?.lowStockAlert ?? defaultWarn),
        lines: [...p.variants]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((v, i) => {
                const promised = perVariant
                    ? (v.inventory?.reserved ?? 0)
                    : (p.variantPromises[v.id] ?? 0);
                return {
                    variantId: v.id,
                    title: v.title || v.sku,
                    quantity: String(
                        perVariant
                            ? (v.inventory?.quantity ?? 0)
                            : promised + (i === 0 ? free : 0),
                    ),
                    lowStockAlert: String(
                        v.inventory?.lowStockAlert ??
                            own?.lowStockAlert ??
                            defaultWarn,
                    ),
                    promised,
                };
            }),
    };
}
