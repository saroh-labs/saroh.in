import type { Prisma } from "@saroh/database";

import { allergenKey } from "./allergen-match";

/**
 * Allergens sent with a note go on Needs attention as Allergy entries (C1).
 * Since Z2a a note keeps text only, and this is how the allergens an app from
 * before Z2a still sends with a note reach the person's record.
 *
 * One entry per allergen name per person: an allergen already on their list
 * (active, or waiting as a suggestion) is not added twice. Only ever adds.
 */
export async function ensureAllergyEntries(
    tx: Pick<Prisma.TransactionClient, "contactAttention" | "storeAllergen">,
    args: {
        organizationId: string;
        contactId: string;
        userId: string;
        allergenIds: string[];
    },
): Promise<number> {
    if (args.allergenIds.length === 0) return 0;
    const [named, onList] = await Promise.all([
        tx.storeAllergen.findMany({
            where: {
                organizationId: args.organizationId,
                id: { in: args.allergenIds },
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true },
        }),
        tx.contactAttention.findMany({
            where: {
                organizationId: args.organizationId,
                contactId: args.contactId,
                kind: "ALLERGY",
                removedAt: null,
            },
            select: { label: true, allergen: { select: { name: true } } },
        }),
    ]);
    const have = new Set(
        onList.map((e) => allergenKey(e.allergen?.name ?? e.label)),
    );
    const add: { id: string; name: string }[] = [];
    for (const a of named) {
        const key = allergenKey(a.name);
        if (have.has(key)) continue;
        have.add(key);
        add.push(a);
    }
    if (add.length === 0) return 0;
    await tx.contactAttention.createMany({
        data: add.map((a) => ({
            organizationId: args.organizationId,
            contactId: args.contactId,
            kind: "ALLERGY" as const,
            label: a.name.trim(),
            allergenId: a.id,
            sensitive: false,
            source: "STAFF" as const,
            status: "ACTIVE" as const,
            createdByUserId: args.userId,
        })),
    });
    return add.length;
}
