/**
 * Catalogue defaults, pure: what a new product starts with, per category,
 * falling through to All products. The service reads and writes rows; these
 * decide what a value resolves to, which saved products are "still on the
 * default", and what to suggest. Kept pure so the unit project pins them.
 */

export const ALL_KEY = "all";

export const DEFAULT_FIELDS = ["howToUse", "lowStockAlert", "returns"] as const;
export type DefaultField = (typeof DEFAULT_FIELDS)[number];

export interface DefaultsEntry {
    howToUse: string | null;
    lowStockAlert: number | null;
    returnsMode: string | null;
    returnsText: string | null;
}

export interface Returns {
    mode: string;
    text: string | null;
}

export interface Effective {
    howToUse: string | null;
    lowStockAlert: number;
    returns: Returns;
}

/** Before a business sets anything: no line, warn at 10, the storefront's rule. */
export const BUILT_IN: Effective = {
    howToUse: null,
    lowStockAlert: 10,
    returns: { mode: "STOREFRONT", text: null },
};

export const EMPTY_ENTRY: DefaultsEntry = {
    howToUse: null,
    lowStockAlert: null,
    returnsMode: null,
    returnsText: null,
};

/**
 * The value a product in `categoryKey` starts with: the category's own when
 * set, else All products', else the built-in. Returns resolve as a pair — a
 * category that sets its own rule sets both mode and text.
 */
export function effectiveFor(
    entries: Record<string, DefaultsEntry>,
    categoryKey: string | null,
): Effective {
    const all = entries[ALL_KEY] ?? EMPTY_ENTRY;
    const own = categoryKey
        ? (entries[categoryKey] ?? EMPTY_ENTRY)
        : EMPTY_ENTRY;
    const returnsFrom = own.returnsMode ? own : all.returnsMode ? all : null;
    return {
        howToUse: own.howToUse ?? all.howToUse ?? BUILT_IN.howToUse,
        lowStockAlert:
            own.lowStockAlert ?? all.lowStockAlert ?? BUILT_IN.lowStockAlert,
        returns: returnsFrom?.returnsMode
            ? {
                  mode: returnsFrom.returnsMode,
                  text:
                      returnsFrom.returnsMode === "OWN"
                          ? returnsFrom.returnsText
                          : null,
              }
            : BUILT_IN.returns,
    };
}

export function sameReturns(a: Returns, b: Returns): boolean {
    return a.mode === b.mode && (a.mode !== "OWN" || a.text === b.text);
}

export interface ProductDefaults {
    id: string;
    categoryId: string | null;
    howToUse: string | null;
    returns: Returns;
    /** Every stock row's warning level; empty when it has no stock rows. */
    lowStockAlerts: number[];
}

/** Whether a saved product still holds the value its category resolves to. */
export function stillOnDefault(
    product: ProductDefaults,
    effective: Effective,
    field: DefaultField,
): boolean {
    if (field === "howToUse") return product.howToUse === effective.howToUse;
    if (field === "returns")
        return sameReturns(product.returns, effective.returns);
    return (
        product.lowStockAlerts.length > 0 &&
        product.lowStockAlerts.every((n) => n === effective.lowStockAlert)
    );
}

export interface Suggestion {
    key: string;
    field: "howToUse" | "lowStockAlert";
    value: string | number;
    count: number;
    total: number;
}

/**
 * "5 of your 6 dresses say …. Make it the default?" — offered when one value
 * is held by at least three products and by more than half of the category,
 * and it is not already the category's default.
 */
export function suggestFor(
    key: string,
    field: "howToUse" | "lowStockAlert",
    values: (string | number | null)[],
    current: string | number | null,
): Suggestion | null {
    const counts = new Map<string | number, number>();
    for (const v of values) {
        if (v === null || v === "") continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: { value: string | number; count: number } | null = null;
    for (const [value, count] of counts) {
        if (!best || count > best.count) best = { value, count };
    }
    if (!best) return null;
    if (best.count < 3 || best.count * 2 <= values.length) return null;
    if (best.value === current) return null;
    return {
        key,
        field,
        value: best.value,
        count: best.count,
        total: values.length,
    };
}
