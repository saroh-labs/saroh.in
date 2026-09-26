"use server";

import { unstable_rethrow } from "next/navigation";

import type { ApiResult } from "@/lib/api/failure";
import { addStock } from "@/lib/stock/service";

import type { CatalogueFilter, CataloguePage } from "./service";
import { duplicateProduct, listCataloguePage } from "./service";

/**
 * Server Actions for the Products list and its quick look (#519, #520):
 * the next page, "+N · Add", and Duplicate. The API decides who may; these
 * only carry the session to it.
 */

/** The next page of the list, or the rows already loaded read again. */
export async function loadCataloguePage(
    filter: CatalogueFilter,
): Promise<ApiResult<CataloguePage>> {
    try {
        const page = await listCataloguePage(filter);
        if (!page) return { ok: false, error: "Pick a business first." };
        return { ok: true, data: page };
    } catch (error) {
        unstable_rethrow(error);
        return {
            ok: false,
            error: "More products couldn't be loaded. Try again.",
        };
    }
}

/**
 * "+N · Add" (#520): units received at one storefront's shelf of a
 * product or a variant. One idempotency key per tap, so a retry adds once.
 */
export async function addQuickStock(input: {
    storeId: string;
    productId: string;
    variantId: string | null;
    units: number;
    idempotencyKey: string;
}) {
    return addStock(input);
}

/** A draft copy, "… (copy)", sold where the original is (#518). */
export async function duplicateListedProduct(
    productId: string,
    storeId: string | null,
) {
    return duplicateProduct(productId, storeId);
}
