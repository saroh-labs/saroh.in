import { isDeepStrictEqual } from "node:util";

import type { Prisma } from "@saroh/database";

/**
 * The editor stamped for Saroh's own writes with no person behind them (a
 * template upgrade, a module switch's menu entry). Never an owner or admin,
 * so its changes wait for approval where approval applies (fail-safe).
 */
export const SYSTEM_EDITOR = "system";

/**
 * Stamp who changed parts of a draft that have no row of their own
 * (`Site.draftEditors`, change units U7): site settings (`site:footer`),
 * removed sections, deleted pages. One merge in the database, so two
 * saves at once each keep their own keys.
 */
export async function stampDraftEditors(
    db: Pick<Prisma.TransactionClient, "$executeRaw">,
    siteId: string,
    userId: string,
    unitKeys: readonly string[],
    at: Date = new Date(),
): Promise<void> {
    if (unitKeys.length === 0) return;
    const patch = Object.fromEntries(
        unitKeys.map((key) => [key, { userId, at: at.toISOString() }]),
    );
    await db.$executeRaw`
        UPDATE "Site"
        SET "draftEditors" = COALESCE("draftEditors", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
        WHERE id = ${siteId}`;
}

/**
 * The unit keys among `pairs` whose value a write changed (`[before,
 * after]`), for {@link stampDraftEditors}: a write that leaves a setting as
 * it was must not take over its stamp (R2, 21 Nov 2026).
 */
export function changedKeys(
    pairs: Record<string, readonly [unknown, unknown]>,
): string[] {
    return Object.entries(pairs)
        .filter(([, [a, b]]) => !isDeepStrictEqual(a ?? null, b ?? null))
        .map(([key]) => key);
}
