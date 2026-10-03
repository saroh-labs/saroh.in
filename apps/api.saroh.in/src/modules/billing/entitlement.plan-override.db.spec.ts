/**
 * Grandfathering (plans catalogue U5) against a real Postgres: the backfill
 * gives every business that joined before the release and has no plan of its
 * own one time-bound `plan` override, and a second run writes nothing; and
 * EntitlementService reads a live plan override ahead of the subscription's
 * plan — through the catalogue since U12, on a made-up live version — until
 * it ends. A `business` or `pro` subscriber never resolves as Free.
 *
 * The override rows satisfy the migration's CHECK (`EntitlementOverride_kind_shape`:
 * a `plan` override carries a `planKey`), so the spec holds in RLS mode, where
 * the CHECKs exist. Every number here is made up. The rest of catalogue
 * resolution is `catalogue-access.db.spec.ts`; over-limit read-only is U13's.
 */
import {
    backfillPricingGrandfather,
    FREE_PLAN_KEYS,
    GRANDFATHER_ACTOR,
    prisma,
    writeCatalogueVersion,
} from "@saroh/database";
import { LEGACY_PLAN_KEYS, planRows } from "@saroh/pricing-catalog";

import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";
import { EntitlementService, FREE_ENTITLEMENTS } from "./entitlement.service";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

/** Made-up legacy limits for each legacy key; none is a real plan's. */
const LEGACY_ROWS: Record<string, Record<string, number | boolean>> = {
    business: { sites: 41, teamMembers: 42, customDomain: true },
    pro: { sites: 31, teamMembers: 32, customDomain: true },
    free: { sites: 1, teamMembers: 1, customDomain: false },
};
// Above any version another spec might leave, so these rows are the newest
// and this catalogue version is the live one.
const VERSION = 900_000 + Math.floor(Math.random() * 9_000);

async function org(name: string, createdAt?: Date) {
    return prisma.organization.create({
        data: {
            name,
            slug: `gf-${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
            ...(createdAt ? { createdAt } : {}),
        },
    });
}

async function subscribe(
    organizationId: string,
    key: string,
    status = "ACTIVE",
) {
    const plan = await prisma.plan.findFirstOrThrow({
        where: { key, version: VERSION, interval: "month" },
    });
    return prisma.subscription.create({
        data: { organizationId, planId: plan.id, status },
    });
}

async function planOverride(
    organizationId: string,
    planKey: string,
    over: { expiresAt?: Date | null; revokedAt?: Date | null } = {},
) {
    return prisma.entitlementOverride.create({
        data: {
            organizationId,
            kind: "plan",
            key: "plan",
            planKey,
            reason: "test",
            grantedByUserId: "staff",
            expiresAt:
                over.expiresAt === undefined
                    ? new Date(Date.now() + DAY)
                    : over.expiresAt,
            revokedAt: over.revokedAt ?? null,
        },
    });
}

describe("grandfathering (DB, U5)", () => {
    const service = new EntitlementService();
    const release = new Date(Date.now() - 60_000);
    const until = new Date(Date.now() + 30 * DAY);

    beforeAll(async () => {
        const catalog = fakeLegacyMappedCatalog();
        await writeCatalogueVersion(prisma, {
            version: VERSION,
            catalog,
            goLiveAt: new Date(Date.now() - DAY),
            policy: "keep",
            planRows: planRows(catalog, VERSION),
        });
        for (const [key, entitlements] of Object.entries(LEGACY_ROWS)) {
            await prisma.plan.create({
                data: {
                    key,
                    version: VERSION,
                    name: `Legacy ${key}`,
                    priceCents: key === "free" ? 0 : 11_100,
                    interval: "month",
                    entitlements,
                },
            });
        }
    });

    afterEach(async () => {
        await prisma.auditEvent.deleteMany({
            where: { actorUserId: GRANDFATHER_ACTOR },
        });
        await prisma.entitlementOverride.deleteMany({});
        await prisma.subscription.deleteMany({});
        await prisma.organization.deleteMany({
            where: { slug: { endsWith: tag } },
        });
    });

    afterAll(async () => {
        await prisma.plan.deleteMany({ where: { version: VERSION } });
        await prisma.pricingCatalogVersion.deleteMany({
            where: { version: VERSION },
        });
    });

    describe("the backfill", () => {
        it("grandfathers every business without a plan, once; a second run adds nothing", async () => {
            const before = new Date(release.getTime() - DAY);
            const orgs = await Promise.all(
                ["One", "Two", "Three"].map((n) => org(n, before)),
            );

            const dry = await backfillPricingGrandfather(prisma, {
                planKey: "grow",
                until,
                joinedBefore: release,
                dryRun: true,
            });
            expect(dry).toMatchObject({ grandfathered: 3, dryRun: true });
            expect(await prisma.entitlementOverride.count()).toBe(0);

            const first = await backfillPricingGrandfather(prisma, {
                planKey: "grow",
                until,
                joinedBefore: release,
            });
            expect(first).toMatchObject({
                organizations: 3,
                grandfathered: 3,
                alreadyOverridden: 0,
            });

            const rows = await prisma.entitlementOverride.findMany({
                where: { organizationId: { in: orgs.map((o) => o.id) } },
            });
            expect(rows).toHaveLength(3);
            for (const r of rows) {
                expect(r).toMatchObject({
                    kind: "plan",
                    key: "plan",
                    planKey: "grow",
                    value: null,
                    revokedAt: null,
                    grantedByUserId: GRANDFATHER_ACTOR,
                });
                // Written with the owner's end date, to the millisecond.
                expect(r.expiresAt?.getTime()).toBe(until.getTime());
            }
            expect(
                await prisma.auditEvent.count({
                    where: {
                        action: "organization.plan.grandfathered",
                        organizationId: { in: orgs.map((o) => o.id) },
                    },
                }),
            ).toBe(3);

            const second = await backfillPricingGrandfather(prisma, {
                planKey: "grow",
                until,
                joinedBefore: release,
            });
            expect(second).toMatchObject({
                grandfathered: 0,
                alreadyOverridden: 3,
            });
            expect(await prisma.entitlementOverride.count()).toBe(3);
        });

        it("leaves a business on a plan of its own, a new sign-up and a staff override alone", async () => {
            const before = new Date(release.getTime() - DAY);
            const paying = await org("Paying", before);
            await subscribe(paying.id, "business");
            const cancelled = await org("Cancelled", before);
            await subscribe(cancelled.id, "business", "CANCELLED");
            const onFree = await org("On free", before);
            await subscribe(onFree.id, "free");
            const staffSet = await org("Staff set", before);
            await planOverride(staffSet.id, "free", { expiresAt: null });
            const newcomer = await org("Newcomer");

            const r = await backfillPricingGrandfather(prisma, {
                planKey: "grow",
                until,
                joinedBefore: release,
            });
            expect(r).toMatchObject({
                grandfathered: 2,
                onAPlan: 1,
                alreadyOverridden: 1,
                joinedAfter: 1,
            });
            const grandfathered = await prisma.entitlementOverride.findMany({
                where: { grantedByUserId: GRANDFATHER_ACTOR },
                select: { organizationId: true },
            });
            expect(grandfathered.map((g) => g.organizationId).sort()).toEqual(
                [cancelled.id, onFree.id].sort(),
            );
        });

        it("agrees with the catalogue on which legacy plans are Free (OQ-3)", () => {
            for (const [legacy, catalogue] of Object.entries(
                LEGACY_PLAN_KEYS,
            )) {
                expect([legacy, FREE_PLAN_KEYS.includes(legacy)]).toEqual([
                    legacy,
                    catalogue === "free",
                ]);
            }
            expect(FREE_PLAN_KEYS).toContain("catalog.free");
        });
    });

    describe("EntitlementService", () => {
        it("puts a grandfathered business on Grow, not the free floor", async () => {
            const o = await org("Grandfathered");
            await planOverride(o.id, "grow");

            const got = await service.getEntitlements(o.id);
            expect(got).not.toEqual(FREE_ENTITLEMENTS);
            // The fake catalogue's Grow (Plan B): its cap, its rows, and a
            // custom domain because it has a price.
            expect(got).toMatchObject({
                products: 222,
                invoicing: true,
                customDomain: true,
            });
        });

        it("honours a plan override over the subscription's own plan", async () => {
            const o = await org("Override wins");
            await subscribe(o.id, "business");
            await planOverride(o.id, "free");

            expect(await service.getPlanEntitlements(o.id)).toMatchObject({
                invoicing: false,
                products: 11,
                customDomain: false,
                sites: 1,
            });
        });

        it.each(["business", "pro"])(
            "reads a %s subscriber as Grow on its own row: a paying customer never resolves as Free",
            async (key) => {
                const own = LEGACY_ROWS[key]!;
                const plain = await org(`Legacy ${key}`);
                await subscribe(plain.id, key);
                const grandfathered = await org(`Legacy ${key} kept`);
                await subscribe(grandfathered.id, key);
                await planOverride(grandfathered.id, "grow");

                for (const o of [plain, grandfathered]) {
                    const got = await service.getEntitlements(o.id);
                    expect(got).not.toEqual(FREE_ENTITLEMENTS);
                    // Its own row for what no catalogue row sells; Grow's
                    // rows for the rest.
                    expect(got).toMatchObject({
                        sites: own.sites,
                        customDomain: true,
                        invoicing: true,
                        products: 222,
                    });
                }
            },
        );

        it("stops the instant the override ends, or is revoked", async () => {
            const ended = await org("Ended");
            await planOverride(ended.id, "grow", {
                expiresAt: new Date(Date.now() - 1000),
            });
            const revoked = await org("Revoked");
            await planOverride(revoked.id, "grow", { revokedAt: new Date() });

            expect(await service.getEntitlements(ended.id)).toEqual(
                FREE_ENTITLEMENTS,
            );
            expect(await service.getEntitlements(revoked.id)).toEqual(
                FREE_ENTITLEMENTS,
            );
            expect(await service.livePlanOverride(ended.id)).toBeNull();
        });

        it("lasts until removed when it has no end date", async () => {
            const o = await org("Open ended");
            const row = await planOverride(o.id, "grow", { expiresAt: null });

            expect(await service.livePlanOverride(o.id)).toEqual({
                id: row.id,
                planKey: "grow",
                expiresAt: null,
            });
        });

        it("reads the backfill's own override end to end", async () => {
            const o = await org(
                "End to end",
                new Date(release.getTime() - DAY),
            );
            await backfillPricingGrandfather(prisma, {
                planKey: "grow",
                until,
                joinedBefore: release,
            });

            expect(await service.livePlanOverride(o.id)).toMatchObject({
                planKey: "grow",
                expiresAt: until,
            });
            expect(await service.getEntitlements(o.id)).not.toEqual(
                FREE_ENTITLEMENTS,
            );
        });
    });
});
