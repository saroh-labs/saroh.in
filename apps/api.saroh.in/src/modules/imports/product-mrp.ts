import type { PriceTerms } from "../invoices/gst-price";
import type { MrpJudged } from "../products/product-rules";
import {
    firstOverMrp,
    hasMrp,
    overMrpMessage,
} from "../products/product-rules";
import type { DuplicatePolicy, ImportValues, RowIssue } from "./import-plan";

/**
 * The MRP rule on an imported product row (GST is part of MRP, the owner,
 * 12 Oct 2026; `products/product-rules.ts`): the amount to pay for one, GST
 * and all, is never more than the MRP. A row that would break it is an
 * error in the preview, named with its sums, and is not written.
 *
 * A row is judged as the product will stand once it is written. A new
 * product is the row alone, priced the business's way. A row that updates a
 * product keeps what the row leaves blank (its MRP, its rate) and what an
 * import never touches (its own "GST on this price", its options). A row
 * that will be skipped is not judged: nothing of it is written. Pure.
 */

/** A stored product, as far as the rule reads it. */
export interface StoredProductSums {
    mrp: string | null;
    gstRate: string | null;
    gstPriceMode: string | null;
    currency: string;
    variants: NonNullable<MrpJudged["variants"]>;
}

export interface ProductMrpContext {
    /** The business's standing (`loadPriceTerms`). */
    terms: PriceTerms;
    policy: DuplicatePolicy;
    /** The business's products by web address. */
    existing: ReadonlyMap<string, StoredProductSums>;
    /** What a new product is priced in when its row names no currency. */
    currency: string;
}

const cell = (value: string | undefined): string | null =>
    value?.trim() ? value.trim() : null;

export function productMrpIssues(
    values: ImportValues,
    key: string | null,
    ctx: ProductMrpContext,
): Omit<RowIssue, "row">[] {
    const price = cell(values.price);
    if (price === null) return [];
    const stored = key === null ? undefined : ctx.existing.get(key);
    // Already in the catalogue and not being updated: the row is skipped.
    if (stored && ctx.policy !== "UPDATE") return [];

    const judged: MrpJudged = {
        price,
        mrp: cell(values.mrp) ?? stored?.mrp ?? null,
        gstRate: cell(values.gstRate) ?? stored?.gstRate ?? null,
        gstPriceMode: stored?.gstPriceMode ?? null,
        variants: stored?.variants ?? [],
    };
    if (!hasMrp(judged)) return [];
    const over = firstOverMrp(judged, ctx.terms);
    if (!over) return [];
    return [
        {
            field: cell(values.mrp) !== null ? "mrp" : "price",
            message: overMrpMessage(
                over,
                cell(values.currency) ?? stored?.currency ?? ctx.currency,
            ),
        },
    ];
}
