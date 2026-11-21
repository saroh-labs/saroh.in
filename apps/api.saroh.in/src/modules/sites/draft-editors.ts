import type { Prisma } from "@saroh/database";

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
