/**
 * Who is waiting for a product to be back (DEC-174, automatic notices U24,
 * #1155): customers who pressed "Tell me when it's back" on the business's
 * site and haven't been emailed yet. The workspace shows the count only,
 * never an address (the API answers counts alone,
 * `GET organizations/:org/stock-watches?productId=`). Plain, so the quick
 * look and the product page share the words.
 */

/** The API's answer: the product's total, and per option. */
export interface WaitingCount {
    productId: string;
    waiting: number;
    /** `variantId` null: the product, whichever option comes back. */
    byOption: { variantId: string | null; waiting: number }[];
}

/** Narrowed field by field; null for anything else. */
export function waitingCountOf(value: unknown): WaitingCount | null {
    if (typeof value !== "object" || value === null) return null;
    const v = value as Record<string, unknown>;
    if (
        typeof v.productId !== "string" ||
        typeof v.waiting !== "number" ||
        !Number.isInteger(v.waiting) ||
        v.waiting < 0 ||
        !Array.isArray(v.byOption)
    ) {
        return null;
    }
    const byOption: WaitingCount["byOption"] = [];
    for (const o of v.byOption as unknown[]) {
        if (typeof o !== "object" || o === null) return null;
        const r = o as Record<string, unknown>;
        if (
            (r.variantId !== null && typeof r.variantId !== "string") ||
            typeof r.waiting !== "number"
        ) {
            return null;
        }
        byOption.push({ variantId: r.variantId, waiting: r.waiting });
    }
    return { productId: v.productId, waiting: v.waiting, byOption };
}

/** "1 person waiting for it", "3 people waiting for it"; null for none. */
export function waitingWords(
    waiting: number | null | undefined,
): string | null {
    if (!waiting || waiting < 1) return null;
    return `${waiting} ${waiting === 1 ? "person" : "people"} waiting for it`;
}

/**
 * Which options they wait for, when it is more than the product as a
 * whole: "2 for Blue, 1 for any". Null when every one waits for the same
 * thing, or no option has a name here.
 */
export function waitingByOptionWords(
    count: WaitingCount,
    titleOf: (variantId: string) => string | null,
): string | null {
    const rows = count.byOption.filter((o) => o.waiting > 0);
    if (!rows.some((o) => o.variantId !== null)) return null;
    const [only] = rows;
    if (rows.length === 1 && only.waiting === count.waiting) {
        const title = only.variantId ? titleOf(only.variantId) : null;
        return title ? `All for ${title}` : null;
    }
    const sorted = [...rows].sort(
        (a, b) =>
            Number(a.variantId === null) - Number(b.variantId === null) ||
            b.waiting - a.waiting,
    );
    const parts = sorted.map((o) => {
        const title = o.variantId ? titleOf(o.variantId) : "any";
        return `${o.waiting} for ${title ?? "an option no longer sold"}`;
    });
    return parts.join(", ");
}
