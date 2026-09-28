import type { CrmResult } from "@/lib/api/http";
import { mutate } from "@/lib/api/http";

import type { BulkLine, StageBatch } from "./bulk";

/**
 * Bulk kitchen moves (B6), scoped by the active organization: hold a batch,
 * send it now, or undo it all. The API checks `order:stage` on each, and
 * the batch id the browser made keeps a retry from moving anything twice.
 * Server-only.
 */

const batches = (rest = "") => `/orders/stage/batches${rest}`;

export function holdStageBatch(input: {
    batchId: string;
    lines: BulkLine[];
    now?: boolean;
}): Promise<CrmResult<StageBatch>> {
    return mutate(
        batches(),
        "POST",
        input,
        "The orders didn't move. Try again.",
    );
}

export function commitStageBatch(
    batchId: string,
): Promise<CrmResult<StageBatch>> {
    return mutate(
        batches(`/${encodeURIComponent(batchId)}/commit`),
        "POST",
        {},
        "The orders couldn't be sent now. They still go ahead in a moment.",
    );
}

export function undoStageBatch(
    batchId: string,
): Promise<CrmResult<StageBatch>> {
    return mutate(
        batches(`/${encodeURIComponent(batchId)}/undo`),
        "POST",
        {},
        "Those orders couldn't be undone. Try again.",
    );
}
