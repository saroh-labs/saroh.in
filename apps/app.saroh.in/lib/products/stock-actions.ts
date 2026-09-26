"use server";

import {
    countStock as countStockApi,
    moveStock as moveStockApi,
} from "@/lib/stock/service";

/**
 * The product page's stock writes (#523): a count of the shelves its sheet
 * changed, and a move between two storefronts. Thin wrappers over the Stock
 * API (`organizations/:org/stock`), which decides who may — "Count and move
 * stock" (`inventory:write`, or `store:write`). Each takes the caller's
 * idempotency key, one per tap, so a retried save applies once.
 */

export async function countProductStock(input: {
    productId: string;
    counts: {
        storeId: string;
        variantId: string | null;
        expected: number;
        counted: number;
    }[];
    idempotencyKey: string;
}) {
    return countStockApi({
        counts: input.counts.map((c) => ({
            storeId: c.storeId,
            productId: input.productId,
            variantId: c.variantId,
            expected: c.expected,
            counted: c.counted,
        })),
        idempotencyKey: input.idempotencyKey,
    });
}

export async function moveProductStock(input: {
    fromStoreId: string;
    toStoreId: string;
    productId: string;
    variantId: string | null;
    units: number;
    idempotencyKey: string;
}) {
    return moveStockApi(input);
}
