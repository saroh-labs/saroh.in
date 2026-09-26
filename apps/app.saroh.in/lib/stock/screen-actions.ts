"use server";

import type { ApiResult } from "@/lib/api/failure";

import type { StockEntryKind } from "./levels";
import type { StockChecks, StockLevels, StockLog } from "./service";
import {
    countStock as countStockApi,
    getStockChecks,
    getStockLevels,
    getStockLog,
    moveStock as moveStockApi,
    recordStockEntry as recordStockEntryApi,
    resolveStockCheck as resolveStockCheckApi,
    setStockTracking as setStockTrackingApi,
    undoStock as undoStockApi,
} from "./service";

/**
 * Server Actions for the Stock screen (#527, #521): the next page of the
 * levels, the log and the checks, and every write the screen makes. Thin
 * wrappers over `service.ts`; the API decides who may. Each write takes the
 * idempotency key the tap made, so a retried save applies once.
 */

const COULDNT_LOAD = "More couldn't be loaded. Try again.";

/** A read for "Show more": the page, or a sentence to show instead. */
async function page<T>(read: () => Promise<T | null>): Promise<ApiResult<T>> {
    try {
        const data = await read();
        return data ? { ok: true, data } : { ok: false, error: COULDNT_LOAD };
    } catch {
        // A refusal or a failure alike: the screen keeps what it has and
        // says the next page didn't come.
        return { ok: false, error: COULDNT_LOAD };
    }
}

export async function loadLevelsPage(filter: {
    storefront?: string;
    q?: string;
    needs?: boolean;
    cursor: string;
    limit: number;
}): Promise<ApiResult<StockLevels>> {
    return page(() => getStockLevels(filter));
}

export async function loadLogPage(filter: {
    kind?: StockEntryKind[];
    storefront?: string;
    product?: string;
    cursor: string;
    limit: number;
}): Promise<ApiResult<StockLog>> {
    return page(() => getStockLog(filter));
}

export async function loadChecksPage(input: {
    cursor: string;
    limit: number;
}): Promise<ApiResult<StockChecks>> {
    return page(() => getStockChecks(input));
}

/**
 * Every shelf the business counts, unpaged — what Move stock and the
 * entries sheet offer to pick from, read when one opens.
 */
export async function loadStockTargets(): Promise<ApiResult<StockLevels>> {
    return page(() => getStockLevels());
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
