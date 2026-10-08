import type { Db } from "./helpers";
import { DAY_MS, id } from "./helpers";
import { SEED_ENTRY_PLAN_ID, SEED_PLAN_ID, seedPlanId } from "./pricing";

/**
 * One of Asha's businesses on a plan that ends (#805): its own plan is the
 * sample catalogue's entry plan, and a `plan` override — the launch offer's
 * mechanism — puts it on the top plan until ten days after the seed ran.
 * `plan-ending.spec.ts` reads the countdown above its pages, on desk and
 * phone, and never writes to it. Nothing else reads it.
 *
 * A re-seed sets the end ten days out again, so the countdown always shows
 * (it reads within 30 days). The plans are the sample catalogue's
 * (`pricing.ts`: made-up numbers, never Saroh's).
 */
export const PLAN_ENDING_BUSINESS = {
    key: "studio",
    name: "Asha's Studio",
} as const;

const SET = "plan-ending";

/** How long after the seed the plan ends: inside the 30-day countdown. */
export const PLAN_ENDING_SEED_DAYS = 10;

export async function seedPlanEndingBusiness(
    prisma: Db,
    founderId: string,
    now: Date,
): Promise<void> {
    const b = PLAN_ENDING_BUSINESS;
    const planId = await seedPlanId(prisma, now, SEED_ENTRY_PLAN_ID);
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
            organizationId_userId: { organizationId: orgId, userId: founderId },
        },
        update: { role: "OWNER" },
        create: {
            id: id("membership", SET, b.key),
            organizationId: orgId,
            userId: founderId,
            role: "OWNER",
        },
    });
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: { timezone: "Asia/Kolkata" },
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
    const expiresAt = new Date(now.getTime() + PLAN_ENDING_SEED_DAYS * DAY_MS);
    await prisma.entitlementOverride.upsert({
        where: { id: id("override", SET, b.key) },
        update: { planKey: SEED_PLAN_ID, expiresAt, revokedAt: null },
        create: {
            id: id("override", SET, b.key),
            organizationId: orgId,
            kind: "plan",
            key: "plan",
            planKey: SEED_PLAN_ID,
            reason: "Launch offer: joined from a waitlist invite.",
            grantedByUserId: founderId,
            expiresAt,
        },
    });
}
