import type { Db } from "./helpers";
import { id } from "./helpers";
import { seedPlanId } from "./pricing";

/**
 * Two of Asha's businesses that Saroh sends booking emails for (DEC-086):
 * `providers-saroh-email.spec.ts` reads Settings → Providers' "Booking
 * emails" block on one per browser — desk and phone each connect and
 * disconnect an email of their own, so they can't share one. Nothing else
 * reads them.
 *
 * The route needs what only staff set in production, through `/admin`: the
 * business's `SAROH_BUSINESS_EMAIL` flag on, plan limits enforced
 * (`PLAN_ENFORCEMENT`), and a live catalogue version whose plan has a
 * `saroh-emails` allowance with a number. The seed writes them here, for
 * these two alone: both flags stay off by default (registered dark, as the
 * module flags are) with an override on for each business, so every other
 * business — Northwind, the showcase, one a spec makes — reads exactly
 * what it did. The allowance is the sample catalogue's (`pricing.ts`,
 * `@saroh/pricing-catalog/seed`: made-up numbers, never Saroh's).
 *
 * Communications is on (rolled out and enabled), since connecting an
 * email is a Communications write. No contact email and no provider: each
 * run starts from Saroh sending, with nowhere for replies to go.
 */
export const SAROH_EMAIL_BUSINESSES = [
    { key: "desk", name: "Asha's Pottery" },
    { key: "phone", name: "Asha's Pottery" },
] as const;

const SET = "saroh-email";

/** The two switches, each off by default and on for these businesses. */
const FLAGS = [
    {
        key: "SAROH_BUSINESS_EMAIL",
        description:
            "Saroh sends a business's booking emails while it has no email of its own (DEC-086). Off by default; on in the seed for Asha's two Saroh-email businesses only.",
    },
    {
        key: "PLAN_ENFORCEMENT",
        description:
            "Applies the plans catalogue's locks and limits. Off by default; on in the seed for Asha's two Saroh-email businesses only.",
    },
] as const;

export async function seedSarohEmailBusinesses(
    prisma: Db,
    founderId: string,
    now: Date,
): Promise<void> {
    // Registry rows, left alone when someone set them (`update: {}`).
    for (const flag of FLAGS) {
        await prisma.featureFlag.upsert({
            where: { key: flag.key },
            update: {},
            create: {
                id: `flag_${flag.key}`,
                key: flag.key,
                description: flag.description,
                enabledByDefault: false,
            },
        });
    }
    await prisma.featureFlag.upsert({
        where: { key: "MODULE_COMMUNICATIONS" },
        update: {},
        create: {
            id: "flag_MODULE_COMMUNICATIONS",
            key: "MODULE_COMMUNICATIONS",
            description:
                "Saroh-side rollout switch for the COMMUNICATIONS module.",
            enabledByDefault: false,
        },
    });
    // The sample catalogue's top plan, as every seeded business.
    const planId = await seedPlanId(prisma, now);

    for (const b of SAROH_EMAIL_BUSINESSES) {
        const orgId = id("org", SET, b.key);
        await prisma.organization.upsert({
            where: { id: orgId },
            update: { name: b.name, kind: "BUSINESS" },
            create: {
                id: orgId,
                name: b.name,
                slug: `${SET}-${b.key}`,
                kind: "BUSINESS",
            },
        });
        await prisma.membership.upsert({
            where: {
                organizationId_userId: {
                    organizationId: orgId,
                    userId: founderId,
                },
            },
            update: { role: "OWNER" },
            create: {
                id: id("membership", SET, b.key),
                organizationId: orgId,
                userId: founderId,
                role: "OWNER",
            },
        });
        // No contact email: a re-seed puts that back too.
        await prisma.businessProfile.upsert({
            where: { organizationId: orgId },
            update: { timezone: "Asia/Kolkata", contactEmail: null },
            create: {
                id: id("profile", SET, b.key),
                organizationId: orgId,
                timezone: "Asia/Kolkata",
            },
        });
        await prisma.subscription.upsert({
            where: { organizationId: orgId },
            update: { planId, status: "ACTIVE" },
            create: {
                id: id("subscription", SET, b.key),
                organizationId: orgId,
                planId,
                status: "ACTIVE",
            },
        });
        await prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: {
                    organizationId: orgId,
                    moduleKey: "COMMUNICATIONS",
                },
            },
            update: { status: "ENABLED" },
            create: {
                id: id("module", SET, b.key, "communications"),
                organizationId: orgId,
                moduleKey: "COMMUNICATIONS",
                status: "ENABLED",
                enabledAt: now,
                enabledByUserId: founderId,
            },
        });
        for (const flagKey of [
            ...FLAGS.map((f) => f.key),
            "MODULE_COMMUNICATIONS",
        ]) {
            await prisma.featureFlagOverride.upsert({
                where: {
                    flagKey_organizationId: { flagKey, organizationId: orgId },
                },
                update: { enabled: true },
                create: {
                    id: id("flagoverride", SET, b.key, flagKey),
                    flagKey,
                    organizationId: orgId,
                    enabled: true,
                },
            });
        }
    }
}
