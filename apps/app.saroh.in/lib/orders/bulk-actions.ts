"use server";

import type { BulkLine } from "./bulk";
import {
    commitStageBatch,
    holdStageBatch,
    undoStageBatch,
} from "./bulk-service";

/**
 * Server Actions for the Orders list's bulk bar (B6): they carry the
 * session to the API, which holds, sends and undoes the batch.
 */

export async function holdBatch(input: {
    batchId: string;
    lines: BulkLine[];
    now?: boolean;
}) {
    return holdStageBatch(input);
}

export async function sendBatchNow(batchId: string) {
    return commitStageBatch(batchId);
}

export async function undoBatch(batchId: string) {
    return undoStageBatch(batchId);
}
