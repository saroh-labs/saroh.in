import type { Prisma, prisma } from "@saroh/database";

/**
 * The service ids a save may keep: this business's services still offered.
 * An id the record already holds whose service has since been deleted is
 * dropped, so an old link heals on the next save instead of refusing it.
 * Answers null when any other id is not a live service of this business
 * (another business's, never existed, or deleted and not held): the caller
 * refuses it with its own 404.
 */
export async function liveServiceIds(
    db: Prisma.TransactionClient | typeof prisma,
    organizationId: string,
    ids: readonly string[],
    held: readonly string[],
): Promise<string[] | null> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return unique;
    const rows = await db.service.findMany({
        where: { id: { in: unique }, organizationId, deletedAt: null },
        select: { id: true },
    });
    const live = new Set(rows.map((r) => r.id));
    const had = new Set(held);
    if (unique.some((id) => !live.has(id) && !had.has(id))) return null;
    return unique.filter((id) => live.has(id));
}
