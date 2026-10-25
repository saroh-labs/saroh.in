/**
 * The demo salon and gym (DEC-188, #1191, plan U8) against a real Postgres:
 * the first run makes both — `isDemo`, a published site at its address,
 * services, hours, Pro by a plan override and no subscription, an owner at
 * an example.com address with no password and no other membership — and
 * nothing on either reads as paused; a second run adds no row; a dry run
 * leaves the database as it was. The unit is
 * packages/database/src/backfill/demo-businesses.ts (imported from source:
 * it carries the showcase fixtures, which the package's bundle leaves out).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import {
    DEMO_BUSINESSES,
    DEMO_PLAN_KEY,
    makeDemoBusinesses,
} from "../../../../../packages/database/src/backfill/demo-businesses";
import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { overLimit } from "../billing/over-limit.service";
import { FlagKey } from "../feature-flags/flags";
import { shopPause } from "../orders/checkout-paused";
import { publicSiteOnlineFor } from "./organization-lifecycle.gate";

const V = 840_000 + Math.floor(Math.random() * 9_000);
const DAY = 24 * 60 * 60 * 1000;
const ids = DEMO_BUSINESSES.map((b) => b.id);

/** Every row the demos own, table by table, to compare runs. */
async function snapshot() {
    const org = { organizationId: { in: ids } };
    const [
        organizations,
        users,
        memberships,
        services,
        rules,
        staff,
        staffServices,
        staffHours,
        sections,
        publications,
        overrides,
        packs,
        plans,
    ] = await Promise.all([
        prisma.organization.findMany({
            where: { id: { in: ids } },
            orderBy: { id: "asc" },
        }),
        prisma.user.findMany({
            where: { memberships: { some: org } },
            orderBy: { id: "asc" },
        }),
        prisma.membership.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.service.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.availabilityRule.findMany({
            where: org,
            orderBy: { id: "asc" },
        }),
        prisma.staffMember.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.staffService.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.staffHours.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.section.count({ where: org }),
        prisma.publication.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.entitlementOverride.findMany({
            where: org,
            orderBy: { id: "asc" },
        }),
        prisma.classPack.findMany({ where: org, orderBy: { id: "asc" } }),
        prisma.subscriptionPlan.findMany({
            where: org,
            orderBy: { id: "asc" },
        }),
    ]);
    return {
        organizations: organizations.map((o) => o.id),
        users: users.map((u) => u.id),
        memberships: memberships.map((m) => m.id),
        services: services.map((s) => s.id),
        rules: rules.map((r) => [r.id, r.updatedAt.toISOString()]),
        staff: staff.map((s) => s.id),
        staffServices: staffServices.map((s) => [s.id, s.createdAt]),
        staffHours: staffHours.map((h) => [h.id, h.startMinute, h.endMinute]),
        sections,
        publications: publications.map((p) => p.id),
        overrides: overrides.map((o) => o.id),
        packs: packs.map((p) => p.id),
        plans: plans.map((p) => p.id),
    };
}

beforeAll(async () => {
    // A live catalogue that has Pro, as production's does.
    const catalog = fakeLegacyMappedCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: true },
        update: { enabledByDefault: true },
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("the demo businesses (DB, DEC-188)", () => {
    it("a dry run reports what it would add and writes nothing", async () => {
        const report = await makeDemoBusinesses(prisma, { dryRun: true });
        expect(report.dryRun).toBe(true);
        expect(report.created).toBeGreaterThan(0);
        expect(
            await prisma.organization.count({ where: { id: { in: ids } } }),
        ).toBe(0);
        expect(
            await prisma.user.count({
                where: {
                    email: {
                        in: DEMO_BUSINESSES.map((b) => b.owner.email),
                    },
                },
            }),
        ).toBe(0);
    });

    it("the first run makes the salon and the gym, each a published demo on Pro", async () => {
        const report = await makeDemoBusinesses(prisma);
        expect(report.created).toBeGreaterThan(0);
        expect(report.planOnLiveCatalogue).toBe(true);

        for (const spec of DEMO_BUSINESSES) {
            const org = await prisma.organization.findUniqueOrThrow({
                where: { id: spec.id },
                include: {
                    sites: true,
                    memberships: { include: { user: true } },
                },
            });
            expect(org).toMatchObject({
                slug: spec.address,
                isDemo: true,
                lifecycleStatus: "ACTIVE",
            });

            // Its site, published at its address.
            expect(org.sites).toHaveLength(1);
            expect(org.sites[0]).toMatchObject({ subdomain: spec.address });
            expect(org.sites[0].currentPublicationId).not.toBeNull();

            // Services on the booking page, the hours they're taken in, and
            // the location's opening hours.
            const services = await prisma.service.findMany({
                where: { organizationId: spec.id },
            });
            expect(services).toHaveLength(spec.services.length);
            expect(
                services.filter((s) => s.showOnBookingPage && !s.isSample)
                    .length,
            ).toBeGreaterThan(0);
            expect(services.every((s) => s.status === "ACTIVE")).toBe(true);
            const hours =
                (await prisma.staffHours.count({
                    where: { organizationId: spec.id },
                })) +
                (await prisma.availabilityRule.count({
                    where: { organizationId: spec.id },
                }));
            expect(hours).toBeGreaterThan(0);
            const settings = await prisma.storeSettings.findFirstOrThrow({
                where: { store: { organizationId: spec.id } },
            });
            expect(settings.openingHours).toHaveLength(7);
            expect(
                await prisma.bookingRules.count({
                    where: { organizationId: spec.id },
                }),
            ).toBe(1);

            // Pro by an operator's plan override, with no subscription.
            expect(
                await prisma.subscription.count({
                    where: { organizationId: spec.id },
                }),
            ).toBe(0);
            expect(
                await prisma.entitlementOverride.findMany({
                    where: { organizationId: spec.id },
                }),
            ).toEqual([
                expect.objectContaining({
                    kind: "plan",
                    planKey: DEMO_PLAN_KEY,
                    expiresAt: null,
                    revokedAt: null,
                }),
            ]);

            // Its owner: an example.com address, no password, no other
            // business.
            expect(org.memberships).toHaveLength(1);
            const owner = org.memberships[0];
            expect(owner.role).toBe("OWNER");
            expect(owner.user.email).toBe(spec.owner.email);
            expect(
                await prisma.account.count({
                    where: { userId: owner.userId },
                }),
            ).toBe(0);
            expect(
                await prisma.membership.count({
                    where: { userId: owner.userId },
                }),
            ).toBe(1);
        }
    });

    it("nothing on either reads as paused: on Pro, online, and a demo rather than paused", async () => {
        const access = new CatalogueAccessService();
        for (const spec of DEMO_BUSINESSES) {
            await expect(access.resolve(spec.id)).resolves.toMatchObject({
                source: "catalogue",
                planId: DEMO_PLAN_KEY,
            });
            overLimit.forget(spec.id);
            await expect(overLimit.pausedNow(spec.id)).resolves.toBeNull();
            await expect(publicSiteOnlineFor(spec.id)).resolves.toBe(true);
            const site = await prisma.site.findFirstOrThrow({
                where: { organizationId: spec.id },
            });
            const store = await prisma.store.findFirstOrThrow({
                where: { organizationId: spec.id },
            });
            // The shop says "This is a demo", never that it is paused.
            await expect(
                shopPause(spec.id, site.id, store.id),
            ).resolves.toEqual({ kept: {}, takingOrders: false, demo: true });
            // Memberships and packs are on sale.
            expect(
                await prisma.subscriptionPlan.count({
                    where: {
                        organizationId: spec.id,
                        status: { not: "ACTIVE" },
                    },
                }),
            ).toBe(0);
            expect(
                await prisma.classPack.count({
                    where: {
                        organizationId: spec.id,
                        status: { not: "ACTIVE" },
                    },
                }),
            ).toBe(0);
        }
    });

    it("a second run adds no row and changes none it keeps", async () => {
        const before = await snapshot();
        const report = await makeDemoBusinesses(prisma);
        expect(report.created).toBe(0);
        expect(await snapshot()).toEqual(before);
    });

    it("a dry run after it still writes 0", async () => {
        const before = await snapshot();
        const report = await makeDemoBusinesses(prisma, { dryRun: true });
        expect(report.created).toBe(0);
        expect(await snapshot()).toEqual(before);
    });
});
