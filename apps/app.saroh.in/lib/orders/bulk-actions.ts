"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { BulkLine } from "./bulk";
import {
    commitStageBatch,
    holdStageBatch,
    undoStageBatch,
} from "./bulk-service";

/**
 * Server Actions for the Orders list's bulk bar (B6): they carry the
 * session to the API, which holds, sends and undoes the batch. Each takes
 * the tab's business last and refuses a moved tab (`writeAsOrg`, DEC-259).
 */

export async function holdBatch(
    input: {
        batchId: string;
        lines: BulkLine[];
        now?: boolean;
    },
    orgId: string,
) {
    return writeAsOrg(orgId, () => holdStageBatch(input));
}

export async function sendBatchNow(batchId: string, orgId: string) {
    return writeAsOrg(orgId, () => commitStageBatch(batchId));
}

export async function undoBatch(batchId: string, orgId: string) {
    return writeAsOrg(orgId, () => undoStageBatch(batchId));
}
