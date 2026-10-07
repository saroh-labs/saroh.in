import { FOUNDER_EMAIL, FOUNDER_PASSWORD, MODULE_STATES } from "./data";
import type { Db } from "./helpers";
import { hashPassword, id } from "./helpers";

/**
 * Asha, who is just starting (DEC-070, K2): a verified account. Browser
 * specs about setting up sign in as her and make businesses of their own;
 * the three seeded below (`FIRST_RUNS`, K3) are for reading a first run,
 * and the two after them (`SITE_STARTS`, K15) for making a first site.
 *
 * A business she made in an earlier run is hers, not the seed's, and is
 * left as it is. Returns her id.
 */
export async function seedFounder(prisma: Db): Promise<string> {
    const founder = await prisma.user.upsert({
        where: { email: FOUNDER_EMAIL },
        update: { name: "Asha Rao", emailVerified: true },
        create: {
            id: id("user", "founder"),
            email: FOUNDER_EMAIL,
            name: "Asha Rao",
            emailVerified: true,
        },
    });
    // better-auth's own hasher, as for the owner and the reviewer.
    await prisma.account.upsert({
        where: { id: id("account", "founder") },
        update: { password: await hashPassword(FOUNDER_PASSWORD) },
        create: {
            id: id("account", "founder"),
            accountId: founder.id,
            providerId: "credential",
            userId: founder.id,
            password: await hashPassword(FOUNDER_PASSWORD),
        },
    });
    await seedFirstRuns(prisma, founder.id, "first-run", FIRST_RUNS);
    await seedFirstRuns(prisma, founder.id, "site-start", SITE_STARTS);
    return founder.id;
}

/**
 * One business of Asha's per kind (DEC-070, K3), with nothing turned on, so
 * Home's first run and `/onboarding/modules` can be read for each kind.
 *
 * A business made through setup can't show them here: the seed keeps every
 * module's rollout flag off by default and rolls modules out to the
 * businesses it makes, one override each, so a business made in a browser
 * spec has every module dark (DEC-057) and its first run offers nothing.
 * These carry the overrides and no module rows. Specs only read them —
 * opening the Turn on sheet without saving — so they run beside each other.
 */
export const FIRST_RUNS = [
    { key: "business", kind: "BUSINESS", name: "Asha's Bakery" },
    { key: "solo", kind: "SOLO", name: "Asha Rao" },
    { key: "work", kind: "WORK", name: "Asha Rao Studio" },
] as const;

/**
 * Two more of Asha's, "A site for my work", each with nothing on (DEC-070,
 * K15): `site-templates.spec.ts` turns Website on in one per browser — desk
 * and phone each make their own site, since a business has one — and reads
 * the portfolio it starts from. Nothing else reads them.
 */
export const SITE_STARTS = [
    { key: "work-desk", kind: "WORK", name: "Asha Rao Studio" },
    { key: "work-phone", kind: "WORK", name: "Asha Rao Studio" },
] as const;

async function seedFirstRuns(
    prisma: Db,
    userId: string,
    set: string,
    runs: readonly { key: string; kind: string; name: string }[],
): Promise<void> {
    for (const run of runs) {
        const orgId = id("org", set, run.key);
        await prisma.organization.upsert({
            where: { id: orgId },
            update: { name: run.name, kind: run.kind },
            create: {
                id: orgId,
                name: run.name,
                slug: `${set}-${run.key}`,
                kind: run.kind,
            },
        });
        await prisma.membership.upsert({
            where: {
                organizationId_userId: { organizationId: orgId, userId },
            },
            update: { role: "OWNER" },
            create: {
                id: id("membership", set, run.key),
                organizationId: orgId,
                userId,
                role: "OWNER",
            },
        });
        // Rolled out, not switched on. The flag rows themselves are written
        // with Northwind's modules.
        for (const m of MODULE_STATES) {
            const flagKey = `MODULE_${m.key}`;
            await prisma.featureFlagOverride.upsert({
                where: {
                    flagKey_organizationId: { flagKey, organizationId: orgId },
                },
                update: { enabled: true },
                create: {
                    id: id("flagoverride", set, run.key, m.key),
                    flagKey,
                    organizationId: orgId,
                    enabled: true,
                },
            });
        }
    }
}
