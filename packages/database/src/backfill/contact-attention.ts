/**
 * C1 backfill — the allergens customers' notes name become Allergy entries
 * on their Needs attention list (DEC-040).
 *
 * For every contact, each allergen its notes name (`ContactNoteAllergen`)
 * becomes one Allergy entry: labelled with the allergen's name, naming the
 * allergen, not sensitive, source STAFF, status ACTIVE, and added by the
 * author of the oldest note that named it, at that note's time. The notes
 * keep their text and allergens; Order Detail's banner still reads them
 * until B15 switches it to the entries.
 *
 * One entry per allergen name per contact: two notes naming "Sesame", or
 * two rows of "Peanuts" the #529 backfill has not merged yet, are one entry.
 * A contact that already has an Allergy entry of that name — made by staff,
 * by a note written since C1 shipped, or by an earlier run, even one the
 * team has since removed — gets none. So it is idempotent: a second run
 * creates nothing, and an entry the team took off never comes back.
 *
 * Each business runs in its own transaction. Run it after the migration
 * that adds `ContactAttention`, and after the #529 catalogue backfill.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/contact-attention.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

/** An allergen's name as lists are compared: "peanuts " is "Peanuts". */
const key = (name: string) => name.trim().toLowerCase();

/** One allergen a contact's note names, oldest note first. */
export interface NotedAllergen {
    contactId: string;
    allergenId: string;
    allergenName: string;
    noteAuthorId: string | null;
    noteCreatedAt: Date;
}

/** An Allergy entry a contact already has, in any state. */
export interface ExistingAllergy {
    contactId: string;
    /** The allergen's name, or the label for an entry naming none. */
    name: string;
}

export interface PlannedAllergy {
    contactId: string;
    allergenId: string;
    label: string;
    createdByUserId: string | null;
    createdAt: Date;
}

/**
 * Which entries to make: one per contact and allergen name that the contact
 * has no Allergy entry for yet, from the oldest note that named it. Pure,
 * so the rule is tested without a database.
 */
export function planAllergyEntries(
    noted: NotedAllergen[],
    existing: ExistingAllergy[],
): PlannedAllergy[] {
    const have = new Set(
        existing.map((e) => `${e.contactId}\u0000${key(e.name)}`),
    );
    const out: PlannedAllergy[] = [];
    const sorted = [...noted].sort(
        (a, b) =>
            a.noteCreatedAt.getTime() - b.noteCreatedAt.getTime() ||
            a.contactId.localeCompare(b.contactId) ||
            a.allergenId.localeCompare(b.allergenId),
    );
    for (const n of sorted) {
        const k = `${n.contactId}\u0000${key(n.allergenName)}`;
        if (have.has(k)) continue;
        have.add(k);
        out.push({
            contactId: n.contactId,
            allergenId: n.allergenId,
            label: n.allergenName.trim(),
            createdByUserId: n.noteAuthorId,
            createdAt: n.noteCreatedAt,
        });
    }
    return out;
}

export interface ContactAttentionBackfillReport {
    /** Businesses with at least one note naming an allergen. */
    organizations: number;
    /** Allergy entries made. */
    created: number;
}

export async function backfillContactAttention(
    prisma: PrismaClient,
): Promise<ContactAttentionBackfillReport> {
    const orgs = await prisma.contactNoteAllergen.findMany({
        distinct: ["organizationId"],
        select: { organizationId: true },
        orderBy: { organizationId: "asc" },
    });
    let created = 0;
    for (const { organizationId } of orgs) {
        created += await prisma.$transaction(async (tx) => {
            const [noted, existing] = await Promise.all([
                tx.contactNoteAllergen.findMany({
                    where: { organizationId },
                    select: {
                        allergen: { select: { id: true, name: true } },
                        note: {
                            select: {
                                contactId: true,
                                createdByUserId: true,
                                createdAt: true,
                            },
                        },
                    },
                }),
                tx.contactAttention.findMany({
                    where: { organizationId, kind: "ALLERGY" },
                    select: {
                        contactId: true,
                        label: true,
                        allergen: { select: { name: true } },
                    },
                }),
            ]);
            const plan = planAllergyEntries(
                noted.map((n) => ({
                    contactId: n.note.contactId,
                    allergenId: n.allergen.id,
                    allergenName: n.allergen.name,
                    noteAuthorId: n.note.createdByUserId,
                    noteCreatedAt: n.note.createdAt,
                })),
                existing.map((e) => ({
                    contactId: e.contactId,
                    name: e.allergen?.name ?? e.label,
                })),
            );
            if (plan.length === 0) return 0;
            await tx.contactAttention.createMany({
                data: plan.map((p) => ({
                    organizationId,
                    contactId: p.contactId,
                    kind: "ALLERGY" as const,
                    label: p.label,
                    allergenId: p.allergenId,
                    sensitive: false,
                    source: "STAFF" as const,
                    status: "ACTIVE" as const,
                    createdByUserId: p.createdByUserId,
                    createdAt: p.createdAt,
                })),
            });
            return plan.length;
        });
    }
    return { organizations: orgs.length, created };
}
