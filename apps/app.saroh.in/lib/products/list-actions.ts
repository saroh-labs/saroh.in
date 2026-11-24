"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import { addStock, getWaitingCount } from "@/lib/stock/service";
import type { WaitingCount } from "@/lib/stock/waiting";

import { duplicateProduct } from "./service";

/**
 * Server Actions for the Products list and its quick look (#519, #520):
 * "+N · Add" and Duplicate; on the list each takes the tab's business last
 * (DEC-259). The API decides who may; these
 * only carry the session to it.
 */

/**
 * "+N · Add" (#520): units received at one storefront's shelf of a
 * product or a variant. One idempotency key per tap, so a retry adds once.
 */
export async function addQuickStock(
    input: {
        storeId: string;
        productId: string;
        variantId: string | null;
        units: number;
        idempotencyKey: string;
    },
    orgId?: string,
) {
    const write = () => addStock(input);
    return orgId ? writeAsOrg(orgId, write) : write();
}

/** A draft copy, "… (copy)", sold where the original is (#518). */
export async function duplicateListedProduct(
    productId: string,
    storeId: string | null,
    orgId?: string,
) {
    const write = () => duplicateProduct(productId, storeId);
    return orgId ? writeAsOrg(orgId, write) : write();
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
