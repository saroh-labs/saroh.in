/**
 * The saving a page shows against an MRP: the MRP struck through, and the
 * whole percent off.
 *
 * An MRP includes all taxes, so it is compared with the amount the customer
 * pays for one, GST and all, never with a typed price that GST is still to
 * be added to. The API works that out (`saving` on a product, each of its
 * options and each card: `products/product-rules.ts` there) and a page only
 * formats it. Where the amount to pay is the MRP, or more, there is no
 * saving: nothing is struck through and no "% off" is said.
 *
 * A plain module, not a client one, so a server page can call it.
 */
export interface MrpSaving {
    /** The MRP to strike through, as a decimal string: "1299.00". */
    mrp: string;
    /** Whole percent off, rounded down. */
    percent: number;
}

/** Narrows an API answer: anything else is "no saving". */
export function isMrpSaving(value: unknown): value is MrpSaving {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.mrp === "string" &&
        typeof v.percent === "number" &&
        Number.isFinite(v.percent) &&
        v.percent >= 0
    );
}

/** Whole percent off, rounded down, or null when nothing is off. */
export function percentOff(price: string, mrp: string | null): number | null {
    if (mrp === null) return null;
    const p = Math.round(Number(price) * 100);
    const m = Math.round(Number(mrp) * 100);
    if (!(m > p) || m === 0) return null;
    return Math.floor(((m - p) * 100) / m);
}

/**
 * The saving to show. `served` is the API's answer and is the truth: null
 * (or anything strange) is no saving.
 *
 * `undefined` is no answer at all: an API from before it, or a page drawn
 * from data that never passed through the public read (the workspace's
 * preview, a template's sample products). The MRP is then compared with
 * `payPrice`, the amount to pay the page already holds, and with nothing
 * when the page doesn't hold one (`null`): a saving it can't be sure of is
 * never claimed.
 */
export function shownSaving(
    served: unknown,
    payPrice: string | null,
    mrp: string | null,
): MrpSaving | null {
    if (served !== undefined) return isMrpSaving(served) ? served : null;
    if (payPrice === null || mrp === null) return null;
    const percent = percentOff(payPrice, mrp);
    return percent === null ? null : { mrp, percent };
}
