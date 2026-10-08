import type { Db } from "./helpers";
import { id } from "./helpers";
import { SEED_ENTRY_PLAN_ID, SEED_PLAN_ID, seedPlanId } from "./pricing";

/**
 * Three of Asha's businesses with no email provider of their own, for
 * `email-setup-prompt.spec.ts` (#850): the prompt to connect one on Home
 * and Settings › Providers. Nothing else reads them.
 *
 * - `desk` / `phone`: one per browser, since each connects an email and
 *   watches the prompt go. Plan limits aren't enforced for them, so the
 *   plan has room and the prompt offers Connect.
 * - `free`: only read. On the catalogue's entry plan with plan limits
 *   enforced (`PLAN_ENFORCEMENT`), so connecting one is locked (DEC-091)
 *   and the prompt says a paid plan brings it, with See plans.
 *
 * Communications is on — rolled out (`MODULE_COMMUNICATIONS`, which only
 * staff set in production, through `/admin`) and enabled — since the
 * prompt asks only while it is. Both flags stay off by default (registered
 * dark, as `saroh-email.ts` registers them), with overrides on for these
 * businesses alone, so every other business reads what it did. No
 * provider, no contact email: a re-seed puts them back.
 */
export const EMAIL_PROMPT_BUSINESSES = [
    { key: "desk", plan: SEED_PLAN_ID, enforced: false },
    { key: "phone", plan: SEED_PLAN_ID, enforced: false },
    { key: "free", plan: SEED_ENTRY_PLAN_ID, enforced: true },
] as const;

const SET = "email-prompt";
const NAME = "Asha's Candles";

const FLAGS = [
    {
        key: "MODULE_COMMUNICATIONS",
        description: "Saroh-side rollout switch for the COMMUNICATIONS module.",
    },
    {
        key: "PLAN_ENFORCEMENT",
        description:
            "Applies the plans catalogue's locks and limits. Off by default; on in the seed for a few of Asha's businesses only.",
    },
] as const;

export async function seedEmailPromptBusinesses(
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
    for (const b of EMAIL_PROMPT_BUSINESSES) {
        const planId = await seedPlanId(prisma, now, b.plan);
        const orgId = id("org", SET, b.key);
        await prisma.organization.upsert({
            where: { id: orgId },
            update: { name: NAME, kind: "BUSINESS" },
            create: {
                id: orgId,
                name: NAME,
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
        const flags = b.enforced
            ? ["MODULE_COMMUNICATIONS", "PLAN_ENFORCEMENT"]
            : ["MODULE_COMMUNICATIONS"];
        for (const flagKey of flags) {
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
