import type { ShelfNeed } from "./stock-words";
import { shelfNeed } from "./stock-words";

/**
 * A tracked product's lines, the way the Stock screen draws them and both
 * "Needs you" lists judge them (#527, #519): one line for a product counted
 * as a whole, a line per variant for one counted per variant — plus, then,
 * the product's own shelf while it still holds something (what order lines
 * without a variant promise). Each line has a cell per storefront asked
 * for: its shelf there (none yet reads as 0), whether that storefront sells
 * it, and whether it needs someone. Pure.
 */

export interface LineShelf {
    storeId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
}

export interface LineCell<S extends LineShelf> {
    storeId: string;
    /** Undefined where this storefront has no shelf for it yet. */
    shelf: S | undefined;
    /** The storefront lists it (and, for a variant, that variant). */
    soldHere: boolean;
    /** Null where it isn't sold, or the shelf is fine. */
    need: ShelfNeed | null;
}

export interface ProductLine<S extends LineShelf> {
    /** Null: the product counted as a whole, or its own shelf. */
    variantId: string | null;
    cells: LineCell<S>[];
}

export function productLines<S extends LineShelf>(
    product: {
        variants: readonly { id: string }[];
        listings: readonly {
            storeId: string;
            variants: readonly { variantId: string }[];
        }[];
    },
    shelves: readonly S[],
    storeIds: readonly string[],
): ProductLine<S>[] {
    const listings = new Map(
        product.listings.map((l) => [
            l.storeId,
            new Set(l.variants.map((v) => v.variantId)),
        ]),
    );
    const perVariant = shelves.some((s) => s.variantId !== null);
    const lines: { variantId: string | null; sells: boolean }[] = perVariant
        ? product.variants.map((v) => ({ variantId: v.id, sells: true }))
        : [{ variantId: null, sells: true }];
    // In per-variant mode the product's own shelf only carries promises of
    // lines without a variant; shown while it holds any, and it sells
    // nothing, so only short makes it need someone.
    if (
        perVariant &&
        shelves.some(
            (s) => s.variantId === null && (s.onHand !== 0 || s.promised !== 0),
        )
    ) {
        lines.push({ variantId: null, sells: false });
    }
    return lines.map((line) => ({
        variantId: line.variantId,
        cells: storeIds.map((storeId) => {
            const shelf = shelves.find(
                (s) => s.storeId === storeId && s.variantId === line.variantId,
            );
            const sold = listings.get(storeId);
            const soldHere =
                sold !== undefined &&
                (line.variantId === null || sold.has(line.variantId));
            return {
                storeId,
                shelf,
                soldHere,
                need: soldHere
                    ? shelfNeed(
                          {
                              onHand: shelf?.onHand ?? 0,
                              promised: shelf?.promised ?? 0,
                              lowStockAlert: shelf?.lowStockAlert ?? 0,
                          },
                          line.sells,
                      )
                    : null,
            };
        }),
    }));
}
