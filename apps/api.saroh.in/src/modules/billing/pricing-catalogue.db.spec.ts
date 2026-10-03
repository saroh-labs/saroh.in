/**
 * The pricing catalogue's tables (plan 2026-09-29 U1) against a real
 * Postgres: a version and its Plan rows are written together and the live one
 * is read by `goLiveAt`; catalogue rows sit beside legacy ones and stay out of
 * the legacy plan pickers; overrides take the new kinds, each with the columns
 * it needs, while old rows read as `raise` and only raises reach
 * EntitlementService; coupon codes are case-blind and used once per business;
 * an add-on can't name another business's subscription.
 *
 * The migration's CHECK constraints exist only in a database built from the
 * migrations (RLS mode); a normal run uses `db push`, so `beforeAll` adds the
 * migration's own statements where they are missing — it proves the
 * migration's SQL, not a copy.
 *
 * Every catalogue here is made up (Plan A/B, 111, 222). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";

import {
    liveCatalogueVersion,
    prisma,
    scheduledCatalogueVersions,
    writeCatalogueVersion,
} from "@saroh/database";
import { parseCatalog, planRows, type Catalog } from "@saroh/pricing-catalog";

import { EntitlementService } from "./entitlement.service";
import { PlansService } from "./plans.service";

const tag = `${process.pid}-${Date.now()}`;
const MIGRATION = path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261021100000_pricing_catalogue/migration.sql",
);

/** Add each of the migration's CHECK constraints the database doesn't have. */
async function ensureMigrationChecks(): Promise<number> {
    const statements = readFileSync(MIGRATION, "utf8")
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => /ADD CONSTRAINT "\w+"\s+CHECK/.test(s));
    for (const sql of statements) {
        const name = /ADD CONSTRAINT "(\w+)"/.exec(sql)![1]!;
        const [has] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pg_constraint WHERE conname = $1`,
            name,
        );
        if (!has || Number(has.n) === 0) await prisma.$executeRawUnsafe(sql);
    }
    return statements.length;
}
const DAY = 24 * 60 * 60 * 1000;

function fakeCatalog(bPricePaise = 11_100): Catalog {
    return parseCatalog({
        plans: [
            { id: "free", name: "Plan A", pricePaise: 0 },
            {
                id: "b",
                name: "Plan B",
                pricePaise: bPricePaise,
                featured: true,
            },
        ],
        groups: [{ id: "g", name: "Group" }],
        modules: [
            {
                id: "products",
                name: "Things",
                group: "g",
                cells: {
                    free: { inc: true, text: "11", limit: 11 },
                    b: { inc: true, text: "222", limit: 222 },
                },
            },
            {
                id: "invoicing",
                name: "Invoices",
                group: "g",
                cells: {
                    free: { inc: false, off: "locked" },
                    b: { inc: true, text: "Included" },
                },
            },
        ],
        yearly: { on: true, paid: 9 },
        gst: { show: "excl" },
    });
}

async function publish(
    version: number,
    goLiveAt: Date,
    catalog = fakeCatalog(),
) {
    return writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        note: `fake v${version}`,
        planRows: planRows(catalog, version),
    });
}

async function org(name: string) {
    return prisma.organization.create({
        data: { name, slug: `pc-${name.toLowerCase()}-${tag}` },
    });
}

/** The Postgres error a refused write carries, through the pg adapter. */
async function refused(write: Promise<unknown>): Promise<string> {
    try {
        await write;
    } catch (e) {
        return String((e as Error).message ?? e);
    }
    throw new Error("expected the database to refuse the write");
}

describe("pricing catalogue tables (DB, U1)", () => {
    const now = new Date();

    beforeAll(async () => {
        expect(await ensureMigrationChecks()).toBeGreaterThanOrEqual(10);
    });

    afterEach(async () => {
        await prisma.subscriptionAddon.deleteMany({});
        await prisma.pricingCouponRedemption.deleteMany({});
        await prisma.pricingCoupon.deleteMany({});
        await prisma.subscription.deleteMany({});
        await prisma.entitlementOverride.deleteMany({});
        await prisma.pricingProviderPlan.deleteMany({});
        await prisma.pricingCatalogVersion.deleteMany({});
        await prisma.plan.deleteMany({});
    });

    describe("versions and their Plan rows", () => {
        it("stores version 1 with a monthly and a yearly row per plan, and reads it as live", async () => {
            const { planIds } = await publish(
                1,
                new Date(now.getTime() - 1000),
            );
            expect(planIds).toHaveLength(4);

            const live = await liveCatalogueVersion(prisma, now);
            expect(live?.version).toBe(1);
            expect(parseCatalog(live?.catalog).plans.map((p) => p.id)).toEqual([
                "free",
                "b",
            ]);

            const b = await prisma.plan.findMany({
                where: { key: "catalog.b", version: 1 },
                orderBy: { interval: "asc" },
                select: {
                    interval: true,
                    priceCents: true,
                    entitlements: true,
                },
            });
            expect(b).toEqual([
                {
                    interval: "month",
                    priceCents: 11_100,
                    entitlements: { products: 222, invoicing: true },
                },
                {
                    interval: "year",
                    priceCents: 99_900,
                    entitlements: { products: 222, invoicing: true },
                },
            ]);
        });

        it("keeps serving the earlier version until a scheduled one goes live", async () => {
            await publish(1, new Date(now.getTime() - DAY));
            await publish(
                2,
                new Date(now.getTime() + DAY),
                fakeCatalog(12_300),
            );

            expect((await liveCatalogueVersion(prisma, now))?.version).toBe(1);
            expect(
                (await scheduledCatalogueVersions(prisma, now)).map(
                    (v) => v.version,
                ),
            ).toEqual([2]);
            expect(
                (
                    await liveCatalogueVersion(
                        prisma,
                        new Date(now.getTime() + 2 * DAY),
                    )
                )?.version,
            ).toBe(2);
        });

        it("writes a version and its rows together, or neither", async () => {
            await publish(1, now);
            const catalog = fakeCatalog();
            // Version 2 whose rows clash with version 1's: nothing of it stays.
            await expect(
                writeCatalogueVersion(prisma, {
                    version: 2,
                    catalog,
                    goLiveAt: now,
                    policy: "keep",
                    planRows: planRows(catalog, 2).concat(planRows(catalog, 2)),
                }),
            ).rejects.toThrow();
            expect(
                await prisma.pricingCatalogVersion.count({
                    where: { version: 2 },
                }),
            ).toBe(0);
            expect(await prisma.plan.count({ where: { version: 2 } })).toBe(0);
        });

        it("refuses a second version with the same number, and an unknown policy", async () => {
            await publish(1, now);
            expect(await refused(publish(1, now))).toMatch(/unique|version/i);
            expect(
                await refused(
                    prisma.$executeRawUnsafe(
                        `INSERT INTO "PricingCatalogVersion" ("id","version","catalog","goLiveAt","policy") VALUES ('pcv-x', 9, '{}', now(), 'maybe')`,
                    ),
                ),
            ).toMatch(/PricingCatalogVersion_policy_known/);
        });

        it("lets a legacy free@1 sit beside catalog.free@1, but not a duplicate cycle", async () => {
            await prisma.plan.create({
                data: {
                    key: "free",
                    version: 1,
                    name: "Legacy",
                    priceCents: 0,
                    interval: "month",
                    entitlements: {},
                },
            });
            await publish(1, now);
            expect(await prisma.plan.count({ where: { version: 1 } })).toBe(5);
            expect(
                await refused(
                    prisma.plan.create({
                        data: {
                            key: "catalog.b",
                            version: 1,
                            name: "Again",
                            interval: "month",
                            entitlements: {},
                        },
                    }),
                ),
            ).toMatch(/unique|key_version_interval|Unique/i);
        });

        it("keeps catalogue rows out of the legacy plan list and subscribe path", async () => {
            await publish(1, now);
            const plans = new PlansService();
            expect(
                (await plans.listActive()).filter((p) =>
                    p.key.startsWith("catalog."),
                ),
            ).toEqual([]);
            await expect(plans.resolveActiveByKey("catalog.b")).rejects.toThrow(
                /No active plan/,
            );
        });

        it("keeps one provider plan per Plan row and provider", async () => {
            const { planIds } = await publish(1, now);
            await prisma.pricingProviderPlan.create({
                data: { planId: planIds[2]!, provider: "RAZORPAY" },
            });
            expect(
                await refused(
                    prisma.pricingProviderPlan.create({
                        data: { planId: planIds[2]!, provider: "RAZORPAY" },
                    }),
                ),
            ).toMatch(/unique|Unique/i);
            expect(
                await refused(
                    prisma.pricingProviderPlan.create({
                        data: {
                            planId: planIds[3]!,
                            provider: "RAZORPAY",
                            status: "MAYBE",
                        },
                    }),
                ),
            ).toMatch(/PricingProviderPlan_status_known/);
        });
    });

    describe("overrides", () => {
        it("reads an override written the old way as a raise, and takes the new kinds", async () => {
            const o = await org("Overrides");
            await prisma.$executeRawUnsafe(
                `INSERT INTO "EntitlementOverride" ("id","organizationId","key","value","reason","grantedByUserId","expiresAt")
                 VALUES ('eo-old-${tag}', $1, 'teamMembers', 4, 'old shape', 'staff', now() + interval '1 day')`,
                o.id,
            );
            const old = await prisma.entitlementOverride.findUniqueOrThrow({
                where: { id: `eo-old-${tag}` },
            });
            expect(old.kind).toBe("raise");

            // A grant that lasts until removed: no value, no end.
            const grant = await prisma.entitlementOverride.create({
                data: {
                    organizationId: o.id,
                    kind: "grant",
                    key: "invoicing",
                    moduleKey: "invoicing",
                    reason: "test",
                    grantedByUserId: "staff",
                    expiresAt: null,
                },
            });
            expect(grant.expiresAt).toBeNull();
            expect(grant.value).toBeNull();

            await prisma.entitlementOverride.create({
                data: {
                    organizationId: o.id,
                    kind: "plan",
                    key: "plan",
                    planKey: "b",
                    reason: "test",
                    grantedByUserId: "staff",
                    expiresAt: new Date(now.getTime() + DAY),
                },
            });

            // Only the raise reaches the legacy entitlement path.
            const live = await new EntitlementService().liveOverrides(o.id);
            expect(live.map((r) => r.key)).toEqual(["teamMembers"]);
        });

        it("holds each kind to the columns it needs", async () => {
            const o = await org("Shapes");
            const base = {
                organizationId: o.id,
                reason: "test",
                grantedByUserId: "staff",
            };
            for (const data of [
                { ...base, kind: "grant", key: "invoicing" },
                {
                    ...base,
                    kind: "limit",
                    key: "products",
                    moduleKey: "products",
                },
                { ...base, kind: "plan", key: "plan" },
                { ...base, kind: "price", key: "price" },
                { ...base, kind: "raise", key: "teamMembers" },
                { ...base, kind: "bogus", key: "x", value: 1 },
            ]) {
                expect(
                    await refused(prisma.entitlementOverride.create({ data })),
                ).toMatch(/EntitlementOverride_kind_shape/);
            }
        });
    });

    describe("subscriptions: pending moves and add-ons", () => {
        it("stores a pending move whole, or not at all", async () => {
            const { planIds } = await publish(1, now);
            const o = await org("Moves");
            const sub = await prisma.subscription.create({
                data: { organizationId: o.id, planId: planIds[0]! },
            });
            expect(sub.billingCycle).toBe("month");
            expect(
                await refused(
                    prisma.subscription.update({
                        where: { id: sub.id },
                        data: { pendingPlanId: planIds[2]! },
                    }),
                ),
            ).toMatch(/Subscription_pending_move_whole/);
            const moved = await prisma.subscription.update({
                where: { id: sub.id },
                data: {
                    pendingPlanId: planIds[2]!,
                    pendingFrom: new Date(now.getTime() + 8 * DAY),
                },
                include: { pendingPlan: true },
            });
            expect(moved.pendingPlan?.key).toBe("catalog.b");
            expect(
                await refused(
                    prisma.subscription.update({
                        where: { id: sub.id },
                        data: { billingCycle: "fortnight" },
                    }),
                ),
            ).toMatch(/Subscription_billingCycle_known/);
        });

        it("ties an add-on to its own business's subscription", async () => {
            const { planIds } = await publish(1, now);
            const mine = await org("Mine");
            const theirs = await org("Theirs");
            const sub = await prisma.subscription.create({
                data: { organizationId: mine.id, planId: planIds[2]! },
            });
            await prisma.subscriptionAddon.create({
                data: {
                    organizationId: mine.id,
                    subscriptionId: sub.id,
                    addonId: "more-things",
                    quantity: 2,
                },
            });
            expect(
                await refused(
                    prisma.subscriptionAddon.create({
                        data: {
                            organizationId: theirs.id,
                            subscriptionId: sub.id,
                            addonId: "other",
                            quantity: 1,
                        },
                    }),
                ),
            ).toMatch(
                /foreign key|SubscriptionAddon_subscriptionId_organizationId_fkey/i,
            );
            expect(
                await refused(
                    prisma.subscriptionAddon.create({
                        data: {
                            organizationId: mine.id,
                            subscriptionId: sub.id,
                            addonId: "zero",
                            quantity: 0,
                        },
                    }),
                ),
            ).toMatch(/SubscriptionAddon_quantity_positive/);
        });
    });

    describe("coupons", () => {
        const coupon = (code: string) =>
            prisma.pricingCoupon.create({
                data: {
                    code,
                    discountPaise: 11_100,
                    months: 2,
                    planIds: ["b"],
                    maxRedemptions: 3,
                },
            });

        it("takes a Razorpay offer id only in Razorpay's shape", async () => {
            const ok = await coupon("FAKE333");
            await expect(
                prisma.pricingCoupon.update({
                    where: { id: ok.id },
                    data: { razorpayOfferId: "offer_ABCDEFGHIJKLMN" },
                }),
            ).resolves.toMatchObject({
                razorpayOfferId: "offer_ABCDEFGHIJKLMN",
            });
            for (const bad of [
                "offer_ABCDEFGHIJKLM",
                "offer_ABCDEFGHIJKLMNO",
                "offer_ABCDEFGHIJK-MN",
                "",
            ]) {
                expect(
                    await refused(
                        prisma.pricingCoupon.update({
                            where: { id: ok.id },
                            data: { razorpayOfferId: bad },
                        }),
                    ),
                ).toMatch(/PricingCoupon_razorpay_offer_shape/);
            }
        });

        it("stores codes upper-cased, so the same code in two cases is refused", async () => {
            await coupon("FAKE111");
            expect(await refused(coupon("FAKE111"))).toMatch(/unique|Unique/i);
            expect(await refused(coupon("fake222"))).toMatch(
                /PricingCoupon_code_upper/,
            );
        });

        it("lets a business redeem a coupon once, and keeps a redeemed coupon", async () => {
            const c = await coupon("FAKE222");
            const o = await org("Coupons");
            await prisma.pricingCouponRedemption.create({
                data: {
                    couponId: c.id,
                    organizationId: o.id,
                    discountPaise: 11_100,
                },
            });
            expect(
                await refused(
                    prisma.pricingCouponRedemption.create({
                        data: {
                            couponId: c.id,
                            organizationId: o.id,
                            discountPaise: 11_100,
                        },
                    }),
                ),
            ).toMatch(/unique|Unique/i);
            expect(
                await refused(
                    prisma.pricingCoupon.delete({ where: { id: c.id } }),
                ),
            ).toMatch(/foreign key|violates|constraint/i);
        });
    });
});
