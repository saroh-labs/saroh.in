import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { readPackKind } from "./pack-kind";

/** Said when a first-pack-only pack is sold to someone who has had one. */
export const FIRST_PACK_ONLY = "Only for a first pack";

/**
 * Refuse (409) selling a "first pack only" pack to someone who already
 * holds or held a pack of its kind (round-2 E13; the Pack Detail design's
 * intro offer is for people who haven't bought one). Any other pack passes.
 *
 * Call it on the sale's transaction, after the buyer has been resolved
 * (`resolveContact`): it serialises every first-pack sale to that person
 * for the rest of the transaction, so two desks — or the desk and the site
 * (A11) — selling the offer at once sell it once.
 */
export async function assertFirstPackAllowed(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        contactId: string;
        pack: { firstPackOnly: boolean; kind: string };
    },
): Promise<void> {
    if (!input.pack.firstPackOnly) return;
    const key = `first-pack:${input.organizationId}:${input.contactId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const before = await tx.packPurchase.count({
        where: {
            organizationId: input.organizationId,
            contactId: input.contactId,
            pack: { kind: readPackKind(input.pack.kind) },
        },
    });
    if (before > 0) {
        throw new ConflictException({
            message: FIRST_PACK_ONLY,
            details: { field: "contactId", reason: "first-pack-only" },
        });
    }
}
