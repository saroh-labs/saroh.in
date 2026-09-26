/**
 * The product page's stock sheet (#523) — what it edits and what a save
 * writes. Pure and client-safe, so the rules can be tested without the
 * sheet: who may change which field, and how one save becomes the fewest
 * writes (a count only of the shelves that changed; the per-storefront set
 * only when a warning level changed or counting starts).
 */

import type { ProductStock } from "../stock/product-stock";
import { isCount, isMoney, paise, trimMoney } from "./editor-sections";
import type { ProductDetail } from "./service";

export interface SheetShelf {
    storeId: string;
    name: string;
    promised: number;
    /** What the shelf holds now: the count's "expected". */
    was: number;
    onHand: string;
}

export interface SheetSize {
    /** Null for the product counted as a whole. */
    variantId: string | null;
    title: string;
    sku: string | null;
    /** Its own price; "" is the product's. */
    price: string;
    warn: string;
    removed: boolean;
    shelves: SheetShelf[];
}

export interface SheetValues {
    price: string;
    mrp: string;
    sizes: SheetSize[];
}

/** Who may change what: prices and sizes need `store:write`; counts, stock. */
export interface SheetMay {
    canWrite: boolean;
    canStock: boolean;
}

/**
 * The sheet's starting values. Each size carries a shelf per storefront it
 * sells at (or still holds stock at). A product that counts nothing yet
 * starts every size at 0 at each storefront; with variants, each size gets
 * its own count from the start.
 */
export function sheetValues(
    product: ProductDetail,
    stock: ProductStock | null,
): SheetValues {
    const shelvesOf = (variantId: string | null): SheetShelf[] => {
        const size =
            stock?.sizes.find((s) => s.variantId === variantId) ??
            stock?.sizes[0];
        return (size?.shelves ?? []).map((s) => ({
            storeId: s.storeId,
            name: s.name,
            promised: variantId === size?.variantId ? s.promised : 0,
            was: variantId === size?.variantId ? s.onHand : 0,
            onHand: String(variantId === size?.variantId ? s.onHand : 0),
        }));
    };
    const warnOf = (variantId: string | null) =>
        String(
            stock?.sizes.find((s) => s.variantId === variantId)?.warnAt ??
                stock?.sizes[0]?.warnAt ??
                10,
        );
    const perVariant =
        product.variants.length > 0 &&
        (stock?.mode === "variant" || !counts(product));
    const sizes: SheetSize[] = perVariant
        ? product.variants.map((v) => ({
              variantId: v.id,
              title: v.title,
              sku: v.sku,
              price: v.price ? trimMoney(v.price) : "",
              warn: warnOf(v.id),
              removed: false,
              shelves: shelvesOf(v.id),
          }))
        : [
              {
                  variantId: null,
                  title:
                      product.variants.length > 0
                          ? "The whole product"
                          : product.name,
                  sku: null,
                  price: "",
                  warn: warnOf(null),
                  removed: false,
                  shelves: shelvesOf(null),
              },
          ];
    return {
        price: trimMoney(product.price),
        mrp: product.mrp ? trimMoney(product.mrp) : "",
        sizes,
    };
}

/** The product already counts something (at the storefront read from). */
function counts(product: ProductDetail): boolean {
    return product.stockMode === "variant" || product.inventory !== null;
}

/** Why Save is off, in words — or null when the sheet can be saved. */
export function sheetProblem(v: SheetValues): string | null {
    if (!isMoney(v.price))
        return "The price: a number with at most two decimal places.";
    if (v.mrp.trim() !== "" && !isMoney(v.mrp))
        return "The MRP: a number with at most two decimal places.";
    if (v.mrp.trim() !== "" && paise(v.mrp) < paise(v.price)) {
        return "MRP can't be lower than the price it sells for.";
    }
    const kept = v.sizes.filter((s) => !s.removed);
    if (kept.length === 0)
        return "Keep at least one size, or remove variants in the full editor.";
    for (const s of kept) {
        if (!s.title.trim()) return "Every size needs a name.";
        const bad =
            (s.price.trim() !== "" && !isMoney(s.price)) ||
            !isCount(s.warn) ||
            s.shelves.some((x) => !isCount(x.onHand));
        if (bad) {
            return `${s.title}: check the price and stock — whole numbers, prices with up to 2 decimals.`;
        }
    }
    return null;
}

/** The writes one save makes, in the order they run. */
export interface SheetPlan {
    product: { price: string; mrp: string | null } | null;
    variants: {
        variantId: string;
        title: string;
        price: string | null;
    }[];
    remove: string[];
    /**
     * Set every size at each storefront — when a warning level changed or
     * counting starts. `perVariant` false: the product's own shelf.
     */
    setAt: {
        storeId: string;
        perVariant: boolean;
        rows: {
            variantId: string | null;
            quantity: number;
            lowStockAlert: number;
        }[];
    }[];
    /** Otherwise, count only the shelves whose number changed. */
    count: {
        storeId: string;
        variantId: string | null;
        expected: number;
        counted: number;
    }[];
}

/**
 * Turn the edited sheet into writes, keeping to what this person may do:
 * no price, name or size change without `store:write`, no count without
 * stock rights. `counted` false: the product counts nothing yet, so the
 * shelves are set rather than counted.
 */
export function planSave(
    was: SheetValues,
    now: SheetValues,
    may: SheetMay,
    counted: boolean,
): SheetPlan {
    const plan: SheetPlan = {
        product: null,
        variants: [],
        remove: [],
        setAt: [],
        count: [],
    };
    if (may.canWrite) {
        const mrp = now.mrp.trim() || null;
        if (now.price.trim() !== was.price || mrp !== (was.mrp || null)) {
            plan.product = { price: now.price.trim(), mrp };
        }
        now.sizes.forEach((s, i) => {
            const before = was.sizes.at(i);
            if (!s.variantId || !before) return;
            if (s.removed) {
                plan.remove.push(s.variantId);
                return;
            }
            if (
                s.title.trim() !== before.title ||
                s.price.trim() !== before.price
            ) {
                plan.variants.push({
                    variantId: s.variantId,
                    title: s.title.trim(),
                    price: s.price.trim() || null,
                });
            }
        });
    }
    if (!may.canStock) return plan;
    const kept = now.sizes.filter((s) => !s.removed);
    const warnChanged = now.sizes.some(
        (s, i) => !s.removed && s.warn.trim() !== was.sizes[i]?.warn,
    );
    const perVariant = kept.some((s) => s.variantId !== null);
    if (warnChanged || !counted) {
        const stores = Array.from(
            new Set(kept.flatMap((s) => s.shelves.map((x) => x.storeId))),
        );
        plan.setAt = stores.map((storeId) => ({
            storeId,
            perVariant,
            rows: kept.map((s) => {
                const shelf = s.shelves.find((x) => x.storeId === storeId);
                return {
                    variantId: s.variantId,
                    quantity: shelf ? Number(shelf.onHand) : 0,
                    lowStockAlert: Number(s.warn),
                };
            }),
        }));
        return plan;
    }
    for (const s of kept) {
        for (const shelf of s.shelves) {
            const n = Number(shelf.onHand);
            if (n !== shelf.was) {
                plan.count.push({
                    storeId: shelf.storeId,
                    variantId: s.variantId,
                    expected: shelf.was,
                    counted: n,
                });
            }
        }
    }
    return plan;
}

/** Nothing to write. */
export function planIsEmpty(plan: SheetPlan): boolean {
    return (
        plan.product === null &&
        plan.variants.length === 0 &&
        plan.remove.length === 0 &&
        plan.setAt.length === 0 &&
        plan.count.length === 0
    );
}

/** "16 can sell" under a size, from the edited counts; "—" while one is wrong. */
export function canSellNote(size: SheetSize): string {
    if (size.shelves.some((x) => !isCount(x.onHand))) return "—";
    return String(
        size.shelves.reduce(
            (n, x) => n + Math.max(0, Number(x.onHand) - x.promised),
            0,
        ),
    );
}

/** What can be moved from a shelf: only what isn't promised. */
export function movable(shelf: { onHand: number; promised: number }): number {
    return Math.max(0, shelf.onHand - shelf.promised);
}
