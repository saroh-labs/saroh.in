/**
 * Access read from the pricing catalogue (plans catalogue U12) against a real
 * Postgres: a business's subscription (or Free) on its version, its plan
 * overrides, add-ons and a due pending move, through `CatalogueAccessService`,
 * `EntitlementService`, module availability (the rollout gate first, then the
 * plan behind PLAN_ENFORCEMENT) and `GET …/billing/access`'s view. Sign-up
 * and the Free-rows backfill put a business on the live Free plan (OQ-2).
 *
 * Every catalogue here is made up (`fakeLegacyMappedCatalog`: Plan A/B/C, 11,
 * 222). Rows satisfy the migration's CHECKs (a plan override carries its
 * `planKey`; a pending move both `pendingPlanId` and `pendingFrom`), so it
 * holds in RLS mode. Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    backfillFreeSubscriptions,
    FREE_ROWS_ACTOR,
    prisma,
    startMissingFreeRows,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { OrganizationOnboardingService } from "../organizations/organization-onboarding.service";
import { CatalogueAccessService } from "./catalogue-access.service";
import { EntitlementService, FREE_ENTITLEMENTS } from "./entitlement.service";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
// Above any version another spec might leave: V1 is live, V2 a later one a
// pending move points at.
const V1 = 800_000 + Math.floor(Math.random() * 9_000);
const V2 = V1 + 1;

const access = new CatalogueAccessService();
const entitlements = new EntitlementService(access);
const flags = new FeatureFlagService();
const availability = new ModuleAvailabilityService(
    flags,
    entitlements,
    new ModuleReadinessRegistry(),
);

let seq = 0;
async function org(name: string, createdAt?: Date) {
    seq += 1;
    return prisma.organization.create({
        data: {
            name,
            slug: `ca-${seq}-${tag}`,
            ...(createdAt ? { createdAt } : {}),
        },
    });
}

async function planRow(planId: string, version = V1) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version,
                interval: "month",
            },
        },
    });
}

async function subscribe(
    organizationId: string,
    planId: string,
    over: { version?: number; status?: string } = {},
) {
    const plan = await planRow(planId, over.version);
    return prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: over.status ?? "ACTIVE",
        },
    });
}

async function planOverride(
    organizationId: string,
    planKey: string,
    expiresAt: Date | null,
) {
    return prisma.entitlementOverride.create({
        data: {
            organizationId,
            kind: "plan",
            key: "plan",
            planKey,
            reason: "test",
            grantedByUserId: "staff",
            expiresAt,
        },
    });
}

const owner = (organizationId: string): OrganizationContext => ({
    organizationId,
    userId: "user",
    role: "OWNER",
});

async function setFlag(key: string, on: boolean) {
    await prisma.featureFlag.upsert({
        where: { key },
        update: { enabledByDefault: on },
        create: { key, enabledByDefault: on },
    });
}

async function install(version: number, catalog: Catalog, goLiveAt: Date) {
    await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

describe("access from the catalogue (DB, U12)", () => {
    beforeAll(async () => {
        await install(
            V1,
            fakeLegacyMappedCatalog(),
            new Date(Date.now() - DAY),
        );
        // A later version, scheduled: live only for a business moved onto it.
        await install(
            V2,
            fakeLegacyMappedCatalog((c) => {
                c.modules.find((m) => m.id === "products")!.cells.free = {
                    inc: true,
                    text: "33",
                    card: "",
                    limit: 33,
                    per: "",
                    soft: false,
                };
            }),
            new Date(Date.now() + 30 * DAY),
        );
    });

    afterEach(async () => {
        const mine = await prisma.organization.findMany({
            where: { slug: { endsWith: tag } },
            select: { id: true },
        });
        await prisma.auditEvent.deleteMany({
            where: { organizationId: { in: mine.map((m) => m.id) } },
        });
        await prisma.featureFlag.deleteMany({
            where: {
                key: {
                    in: [
                        FlagKey.PLAN_ENFORCEMENT,
                        FlagKey.MODULE_APPOINTMENTS,
                        FlagKey.MODULE_COMMERCE,
                    ],
                },
            },
        });
        await prisma.organization.deleteMany({
            where: { slug: { endsWith: tag } },
        });
    });

    afterAll(async () => {
        await prisma.subscription.deleteMany({
            where: { plan: { version: { in: [V1, V2] } } },
        });
        await prisma.plan.deleteMany({ where: { version: { in: [V1, V2] } } });
        await prisma.pricingCatalogVersion.deleteMany({
            where: { version: { in: [V1, V2] } },
        });
    });

    it("locks what Free leaves out and caps what it limits", async () => {
        const o = await org("Free business");
        await subscribe(o.id, "free");

        const a = await access.resolve(o.id);
        expect(a).toMatchObject({
            source: "catalogue",
            version: V1,
            planId: "free",
        });
        const state = Object.fromEntries(
            a.source === "catalogue"
                ? a.modules.map((m) => [m.moduleId, [m.state, m.limit]])
                : [],
        );
        expect(state).toMatchObject({
            invoicing: ["locked", null],
            bookings: ["locked", null],
            products: ["on", 11],
        });
        await expect(entitlements.can(o.id, "invoicing")).resolves.toBe(false);
        await expect(entitlements.can(o.id, "customDomain")).resolves.toBe(
            false,
        );
    });

    it("keeps a grandfathered business on Grow until its date, then Free", async () => {
        const kept = await org("Kept");
        await subscribe(kept.id, "free");
        await planOverride(kept.id, "grow", new Date(Date.now() + DAY));
        const ended = await org("Ended");
        await subscribe(ended.id, "free");
        await planOverride(ended.id, "grow", new Date(Date.now() - 1000));

        await expect(
            entitlements.getEntitlements(kept.id),
        ).resolves.toMatchObject({
            products: 222,
            invoicing: true,
            customDomain: true,
        });
        await expect(
            entitlements.getEntitlements(ended.id),
        ).resolves.toMatchObject({ products: 11, invoicing: false });
    });

    it("follows a pending move once its date has passed", async () => {
        const o = await org("Moved");
        const sub = await subscribe(o.id, "free");
        const next = await planRow("free", V2);
        await prisma.subscription.update({
            where: { id: sub.id },
            data: {
                pendingPlanId: next.id,
                pendingFrom: new Date(Date.now() + DAY),
            },
        });

        const before = await access.resolve(o.id);
        expect(before).toMatchObject({ version: V1 });
        expect(before.entitlements.products).toBe(11);

        await prisma.subscription.update({
            where: { id: sub.id },
            data: { pendingFrom: new Date(Date.now() - 1000) },
        });
        const after = await access.resolve(o.id);
        expect(after).toMatchObject({ version: V2 });
        expect(after.entitlements.products).toBe(33);
    });

    it("adds add-ons bought on the subscription", async () => {
        const o = await org("Bought more");
        const sub = await subscribe(o.id, "free");
        await prisma.subscriptionAddon.create({
            data: {
                organizationId: o.id,
                subscriptionId: sub.id,
                addonId: "things-pack",
                quantity: 1,
            },
        });

        await expect(entitlements.getEntitlements(o.id)).resolves.toMatchObject(
            { products: 22 },
        );
    });

    it("reads a business with no row and no override as the free floor", async () => {
        const o = await org("Untouched");

        await expect(access.resolve(o.id)).resolves.toMatchObject({
            source: "legacy",
            reason: "no-plan",
            entitlements: FREE_ENTITLEMENTS,
        });
    });

    describe("module availability", () => {
        async function appointmentsFor(organizationId: string) {
            await prisma.organizationModule.create({
                data: {
                    organizationId,
                    moduleKey: "APPOINTMENTS",
                    status: "ENABLED",
                },
            });
            return availability.evaluate({
                organizationId,
                moduleKey: "APPOINTMENTS",
                organizationRole: "OWNER",
            });
        }

        it("locks a module the plan leaves out, behind the kill switch", async () => {
            await setFlag(FlagKey.MODULE_APPOINTMENTS, true);
            const o = await org("Free, no bookings");
            await subscribe(o.id, "free");

            // Kill switch off: nothing new is locked.
            const off = await appointmentsFor(o.id);
            expect(off.entitled).toBe(true);

            await setFlag(FlagKey.PLAN_ENFORCEMENT, true);
            const on = await availability.evaluate({
                organizationId: o.id,
                moduleKey: "APPOINTMENTS",
                organizationRole: "OWNER",
            });
            expect(on.blockers.map((b) => b.code)).toContain(
                "ENTITLEMENT_REQUIRED",
            );
        });

        it("hides a module rolled out off even on the top plan (DEC-057 first)", async () => {
            await setFlag(FlagKey.PLAN_ENFORCEMENT, true);
            await setFlag(FlagKey.MODULE_COMMERCE, false);
            const o = await org("Top plan");
            await subscribe(o.id, "pro");

            const r = await availability.evaluate({
                organizationId: o.id,
                moduleKey: "COMMERCE",
                organizationRole: "OWNER",
            });
            expect(r.blockers[0]?.code).toBe("ROLLOUT_DISABLED");
            expect(r.blockers.map((b) => b.code)).not.toContain(
                "ENTITLEMENT_REQUIRED",
            );
        });
    });

    it("shows the business its rows, upgrades, override and pending move", async () => {
        const o = await org("Viewer");
        const sub = await subscribe(o.id, "free");
        const next = await planRow("free", V2);
        const from = new Date(Date.now() + 9 * DAY);
        await prisma.subscription.update({
            where: { id: sub.id },
            data: { pendingPlanId: next.id, pendingFrom: from },
        });

        const view = await access.view(owner(o.id));
        expect(view).toMatchObject({
            source: "catalogue",
            // PLAN_ENFORCEMENT is off here: the app shows no lock or notice.
            enforced: false,
            version: V1,
            plan: { id: "free", name: "Plan A" },
            pricePaise: 0,
            planOverride: null,
            pendingMove: {
                planId: "free",
                version: V2,
                from: from.toISOString(),
            },
        });
        expect(view.modules.find((m) => m.moduleId === "invoicing")).toEqual(
            expect.objectContaining({
                state: "locked",
                menu: "money",
                usage: null,
                upgradeTo: {
                    planId: "grow",
                    name: "Plan B",
                    pricePaise: 22_200,
                },
            }),
        );
        await expect(
            access.view({ ...owner(o.id), role: "MEMBER" }),
        ).rejects.toThrow();
    });

    describe("starting on Free (OQ-2)", () => {
        it("gives a new sign-up its Free row on the live version", async () => {
            const user = await prisma.user.create({
                data: { email: `ca-${tag}@saroh.test` },
            });
            const made = await new OrganizationOnboardingService(
                new AuditService(),
            ).onboard(user.id, {
                name: "New sign-up",
                address: `ca-new-${process.pid}`,
            });
            await prisma.organization.update({
                where: { id: made.id },
                data: { slug: `ca-new-${tag}` },
            });

            const sub = await prisma.subscription.findUniqueOrThrow({
                where: { organizationId: made.id },
                include: { plan: true },
            });
            expect(sub).toMatchObject({
                status: "ACTIVE",
                provider: null,
                plan: { key: "catalog.free", version: V1, interval: "month" },
            });
            await expect(access.resolve(made.id)).resolves.toMatchObject({
                source: "catalogue",
                planId: "free",
            });
        });

        it("never replaces a subscription that exists", async () => {
            const o = await org("Paying");
            await subscribe(o.id, "pro");

            await expect(
                startOnFreePlan(prisma, o.id, { planId: "free" }),
            ).resolves.toBe("has-subscription");
        });

        it("backfills a Free row once, never before a business is grandfathered", async () => {
            const release = new Date(Date.now() - 60_000);
            const before = new Date(release.getTime() - DAY);
            const grandfathered = await org("Grandfathered", before);
            await planOverride(
                grandfathered.id,
                "grow",
                new Date(Date.now() + DAY),
            );
            const waiting = await org("Not yet", before);
            const newcomer = await org("Newcomer");
            const paying = await org("Paying");
            await subscribe(paying.id, "pro");
            const mine = [grandfathered.id, waiting.id, newcomer.id, paying.id];

            const dry = await backfillFreeSubscriptions(prisma, {
                planId: "free",
                grandfatheredBefore: release,
                dryRun: true,
            });
            expect(dry).toMatchObject({
                started: 2,
                notGrandfathered: 1,
                dryRun: true,
            });
            expect(
                await prisma.subscription.count({
                    where: { organizationId: { in: mine } },
                }),
            ).toBe(1);

            const first = await backfillFreeSubscriptions(prisma, {
                planId: "free",
                grandfatheredBefore: release,
            });
            expect(first).toMatchObject({ started: 2, notGrandfathered: 1 });
            expect(
                await prisma.auditEvent.count({
                    where: {
                        actorUserId: FREE_ROWS_ACTOR,
                        organizationId: { in: mine },
                    },
                }),
            ).toBe(2);
            // The grandfathered business still reads Grow: the override wins.
            await expect(
                entitlements.getEntitlements(grandfathered.id),
            ).resolves.toMatchObject({ products: 222 });
            await expect(access.resolve(waiting.id)).resolves.toMatchObject({
                source: "legacy",
                reason: "no-plan",
            });

            const second = await backfillFreeSubscriptions(prisma, {
                planId: "free",
                grandfatheredBefore: release,
            });
            expect(second).toMatchObject({ started: 0, notGrandfathered: 1 });
        });

        it("at go-live, starts who signed up with no version live, never an older business (#839)", async () => {
            // Before any version was published on this database.
            const longAgo = new Date("2000-01-01T00:00:00.000Z");
            const older = await org("Before pricing", longAgo);
            const olderOverride = await org("Before pricing, kept", longAgo);
            await planOverride(
                olderOverride.id,
                "grow",
                new Date(Date.now() + DAY),
            );
            // Signed up while no version was live, so sign-up wrote no row.
            const meanwhile = await org("Signed up meanwhile");
            const mine = [older.id, olderOverride.id, meanwhile.id];

            await startMissingFreeRows(prisma, { planId: "free" });

            const rows = await prisma.subscription.findMany({
                where: { organizationId: { in: mine } },
                select: {
                    organizationId: true,
                    plan: { select: { key: true } },
                },
            });
            expect(rows.map((r) => r.organizationId).sort()).toEqual(
                [meanwhile.id, olderOverride.id].sort(),
            );
            expect(rows.every((r) => r.plan.key === "catalog.free")).toBe(true);
            await expect(access.resolve(older.id)).resolves.toMatchObject({
                source: "legacy",
                reason: "no-plan",
            });
            await expect(access.resolve(meanwhile.id)).resolves.toMatchObject({
                source: "catalogue",
                planId: "free",
            });

            // A second run writes nothing for them.
            await startMissingFreeRows(prisma, { planId: "free" });
            expect(
                await prisma.subscription.count({
                    where: { organizationId: { in: mine } },
                }),
            ).toBe(2);
        });

        it("writes nothing when the live version has no such plan", async () => {
            await expect(
                startMissingFreeRows(prisma, { planId: "no-such-plan" }),
            ).resolves.toBeNull();
        });
    });
});
