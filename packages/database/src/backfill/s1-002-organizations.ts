/**
 * S1-002 backfill — one Organization + OWNER Membership per existing tenant.
 *
 * Every existing Store (the legacy effective tenant) is attached to exactly one
 * synthesized Organization, and each of the Store's StoreOwner rows becomes an
 * Organization Membership. See ADR-001.
 *
 * Idempotent: a Store already linked to an Organization is skipped, and each
 * Store's create/link/membership steps run in a single transaction so a partial
 * run leaves no orphan Organization. Safe to re-run.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/s1-002-organizations.ts`
 * (with DATABASE_URL pointing at the target DB).
 */
import { prisma } from "../client";

function normalizeRole(storeOwnerRole: string): "OWNER" | "ADMIN" {
    return storeOwnerRole === "ADMIN" ? "ADMIN" : "OWNER";
}

async function main() {
    const stores = await prisma.store.findMany({ include: { owners: true } });

    let created = 0;
    let skipped = 0;
    let memberships = 0;
    const noOwner: string[] = [];

    for (const store of stores) {
        if (store.organizationId) {
            skipped++;
            continue;
        }

        await prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: { name: store.name, slug: store.slug },
            });
            await tx.store.update({
                where: { id: store.id },
                data: { organizationId: org.id },
            });
            for (const owner of store.owners) {
                await tx.membership.upsert({
                    where: {
                        organizationId_userId: {
                            organizationId: org.id,
                            userId: owner.userId,
                        },
                    },
                    create: {
                        organizationId: org.id,
                        userId: owner.userId,
                        role: normalizeRole(owner.role),
                    },
                    update: { role: normalizeRole(owner.role) },
                });
                memberships++;
            }
        });

        if (store.owners.length === 0) noOwner.push(store.slug);
        created++;
    }

    console.log(
        `[s1-002] organizations created: ${created}, stores already linked: ${skipped}, memberships upserted: ${memberships}`,
    );
    if (noOwner.length > 0) {
        console.warn(
            `[s1-002] WARNING: ${noOwner.length} store(s) had no StoreOwner and got an Organization with no OWNER membership: ${noOwner.join(", ")}`,
        );
    }
}

main()
    .catch((e: unknown) => {
        console.error(
            "[s1-002] backfill failed:",
            e instanceof Error ? e.message : e,
        );
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
