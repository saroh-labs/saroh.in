import { BadRequestException } from "@nestjs/common";

/**
 * Safe bulk-operation contract (#124, Task 9 Step 1).
 *
 * Bulk commands must be: BOUNDED (a hard cap, never an unbounded sweep),
 * IDEMPOTENT (duplicate ids collapse; the per-item op must itself be
 * idempotent), AUTHORIZED PER RECORD (the caller's `op` enforces access for each
 * id and throws to reject), and return PARTIAL-FAILURE detail (one bad record
 * never aborts the rest). This helper encodes all four so every bulk endpoint
 * gets the same guarantees.
 */
export const MAX_BULK = 100;

export interface BulkResult {
    succeeded: string[];
    failed: { id: string; error: string }[];
}

export async function executeBulk(
    ids: string[],
    op: (id: string) => Promise<void>,
): Promise<BulkResult> {
    if (ids.length > MAX_BULK) {
        throw new BadRequestException(
            `Bulk operations are limited to ${MAX_BULK} records at a time.`,
        );
    }
    // Idempotent: a repeated id is applied once.
    const unique = [...new Set(ids)];

    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of unique) {
        try {
            await op(id);
            succeeded.push(id);
        } catch (error) {
            failed.push({
                id,
                error: error instanceof Error ? error.message : "Failed",
            });
        }
    }
    return { succeeded, failed };
}
