import type { Prisma } from "@saroh/database";

import { allergenKey } from "./allergen-match";

/**
 * A note that names an allergen puts it on Needs attention too (C1), for one
 * release: Order Detail's banner still reads the notes' allergens, and the
 * Allergy entries are what it reads next (B15). The note keeps its allergens
 * as written.
 *
 * One entry per allergen name per person: an allergen already on their list
 * (active, or waiting as a suggestion) is not added twice. Only ever adds —
 * taking an allergen off a note leaves the entry for the team to remove on
 * Needs attention, since it may have been added there on its own. An edit
 * passes only the allergens it adds (`contact-notes.service.ts`), so an
 * entry the team removed isn't brought back by the note that named it.
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
