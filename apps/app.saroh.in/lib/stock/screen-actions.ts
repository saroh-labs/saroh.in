"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import {
    countStock as countStockApi,
    moveStock as moveStockApi,
    recordStockEntry as recordStockEntryApi,
    resolveStockCheck as resolveStockCheckApi,
    setStockTracking as setStockTrackingApi,
    undoStock as undoStockApi,
} from "./service";

/**
 * Server Actions for the Stock screen (#527, #521): every write the screen
 * makes. Its reads are React Query's (`lib/stock/queries.ts`, DEC-259).
 * Thin wrappers over `service.ts`; the API decides who may. Each write
 * takes the idempotency key the tap made, so a retried save applies once,
 * and the tab's business last (`writeAsOrg`), refusing a tab whose
 * business has since changed.
 */

const asOrg = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

export async function countStock(
    input: Parameters<typeof countStockApi>[0],
    orgId?: string,
) {
    return asOrg(orgId, () => countStockApi(input));
}

export async function undoStock(
    input: Parameters<typeof undoStockApi>[0],
    orgId?: string,
) {
    return asOrg(orgId, () => undoStockApi(input));
}

export async function moveStock(
    input: Parameters<typeof moveStockApi>[0],
    orgId?: string,
) {
    return asOrg(orgId, () => moveStockApi(input));
}

export async function recordStockEntry(
    input: Parameters<typeof recordStockEntryApi>[0],
    orgId?: string,
) {
    return asOrg(orgId, () => recordStockEntryApi(input));
}

export async function resolveStockCheck(
    key: string,
    input: { note?: string; idempotencyKey: string },
    orgId?: string,
) {
    return asOrg(orgId, () => resolveStockCheckApi(key, input));
}

/** The business's Track stock switch (`store:write`). */
export async function setBusinessStockTracking(
    tracked: boolean,
    orgId?: string,
) {
    return asOrg(orgId, () => setStockTrackingApi(tracked));
}
