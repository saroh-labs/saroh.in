"use server";

import { unstable_rethrow } from "next/navigation";

import type { ApiResult } from "@/lib/api/failure";
import { addStock, getWaitingCount } from "@/lib/stock/service";
import type { WaitingCount } from "@/lib/stock/waiting";

import type { CatalogueFilter, CataloguePage } from "./service";
import { duplicateProduct, listCataloguePage } from "./service";

/**
 * Server Actions for the Products list and its quick look (#519, #520):
 * the page read again, "+N · Add", and Duplicate. The API decides who may; these
 * only carry the session to it.
 */

/** A page of the list, read again after something on it changed. */
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
            error: "Products couldn't be loaded. Try again.",
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

/**
 * How many customers wait for it to be back (DEC-174, U24), for the quick
 * look's Stock line. Null when it can't be said: the line is left out.
 */
export async function loadWaitingCount(
    productId: string,
): Promise<WaitingCount | null> {
    return getWaitingCount(productId);
}
