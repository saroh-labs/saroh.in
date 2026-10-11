"use server";

import type { ApiResult } from "@/lib/api/failure";

import type { StockLevels } from "./service";
import {
    countStock as countStockApi,
    getStockLevels,
    moveStock as moveStockApi,
    recordStockEntry as recordStockEntryApi,
    resolveStockCheck as resolveStockCheckApi,
    setStockTracking as setStockTrackingApi,
    undoStock as undoStockApi,
} from "./service";

/**
 * Server Actions for the Stock screen (#527, #521): the shelves a sheet
 * offers to pick from, and every write the screen makes. The lists' pages
 * are the screen's own address, read by the page. Thin wrappers over
 * `service.ts`; the API decides who may. Each write takes the idempotency
 * key the tap made, so a retried save applies once.
 */

const COULDNT_LOAD = "Stock couldn't be loaded. Try again.";

/**
 * Every shelf the business counts, unpaged — what Move stock and the
 * entries sheet offer to pick from, read when one opens. A refusal or a
 * failure alike is a sentence to show, never an empty list.
 */
export async function loadStockTargets(): Promise<ApiResult<StockLevels>> {
    try {
        const data = await getStockLevels();
        return data ? { ok: true, data } : { ok: false, error: COULDNT_LOAD };
    } catch {
        return { ok: false, error: COULDNT_LOAD };
    }
}

export async function countStock(input: Parameters<typeof countStockApi>[0]) {
    return countStockApi(input);
}

export async function undoStock(input: Parameters<typeof undoStockApi>[0]) {
    return undoStockApi(input);
}

export async function moveStock(input: Parameters<typeof moveStockApi>[0]) {
    return moveStockApi(input);
}

export async function recordStockEntry(
    input: Parameters<typeof recordStockEntryApi>[0],
) {
    return recordStockEntryApi(input);
}

export async function resolveStockCheck(
    key: string,
    input: { note?: string; idempotencyKey: string },
) {
    return resolveStockCheckApi(key, input);
}

/** The business's Track stock switch (`store:write`). */
export async function setBusinessStockTracking(tracked: boolean) {
    return setStockTrackingApi(tracked);
}
