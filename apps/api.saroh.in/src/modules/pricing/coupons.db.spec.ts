/**
 * Coupons against a real Postgres (plans catalogue U4, KTD-5): codes stored
 * upper-cased and unique for good, discounts checked against the live
 * catalogue, a used coupon archived rather than deleted, and an audit row
 * for every change.
 *
 * Every catalogue and amount here is made up (`test/fixtures/pricing-catalog.ts`).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
// The controller's guard pulls in better-auth (ESM), which Jest can't load;
// these specs call the controller directly, so the guard is a stand-in.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminPricingController } from "./admin-pricing.controller";
import { CatalogueWritesService } from "./catalogue-writes.service";
import { CatalogueService } from "./catalogue.service";
import { CouponsService } from "./coupons.service";
import { ImpactService } from "./impact.service";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

const audit = new AdminAuditService();
const controller = new AdminPricingController(
    new CatalogueService(new ImpactService()),
    new CatalogueWritesService(audit),
    new CouponsService(audit),
    new IdempotencyService(),
);

let n = 0;
const key = () => `coupon-${tag}-${++n}`;

describe("coupons (DB, U4)", () => {
    let staffId: string;
    const me = () =>
        ({
            userId: staffId,
            platformAdminId: "pa",
            roles: [],
            permissions: [],
            viaBootstrap: false,
        }) as never;

    const create = (over: Record<string, unknown> = {}) =>
        controller.createCoupon(me(), {
            code: "fake-111",
            discountPaise: 111,
            months: 2,
            planIds: ["b"],
            maxRedemptions: 3,
            reason: "fake coupon",
            idempotencyKey: key(),
            ...over,
        } as never);

    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: { email: `coupons-${tag}@example.com`, name: "Staff" },
            })
        ).id;
        const catalog = fakeCatalog();
        await writeCatalogueVersion(prisma, {
            version: 1,
            catalog,
            goLiveAt: new Date(Date.now() - DAY),
            policy: "keep",
            planRows: planRows(catalog, 1),
        });
    });

    beforeEach(async () => {
        await prisma.pricingCouponRedemption.deleteMany({});
        await prisma.pricingCoupon.deleteMany({});
        await prisma.adminAuditEvent.deleteMany({});
    });

    it("stores the code upper-cased, paused by default, and audits it", async () => {
        const c = await create();
        expect(c).toMatchObject({
            code: "FAKE-111",
            active: false,
            uses: 0,
            planIds: ["b"],
        });
        expect(
            await prisma.adminAuditEvent.findFirstOrThrow({
                where: { action: "pricing.coupon.create" },
            }),
        ).toMatchObject({
            permission: "coupons:manage",
            reason: "fake coupon",
            targetId: c.id,
        });
        expect((await controller.listCoupons(null)).map((x) => x.code)).toEqual(
            ["FAKE-111"],
        );
    });

    it("refuses a code that exists, whatever its case", async () => {
        await create();
        await expect(create({ code: "FAKE-111" })).rejects.toMatchObject({
            status: 409,
        });
        await expect(create({ code: "Fake-111" })).rejects.toMatchObject({
            status: 409,
        });
    });

    it("refuses a discount above the plan's monthly price, a free plan, and an unknown plan", async () => {
        // Plan B is 22_200 a month in the fixture.
        await expect(
            create({ code: "TOO-MUCH", discountPaise: 22_201 }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            create({ code: "ON-FREE", planIds: ["free"] }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            create({ code: "NO-PLAN", planIds: ["zzz"] }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            create({
                code: "EXPIRED",
                expiresAt: new Date(Date.now() - DAY).toISOString(),
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(await prisma.pricingCoupon.count()).toBe(0);
    });

    it("pauses, resumes and changes a coupon, but not below the uses it has", async () => {
        const c = await create();
        const o = await prisma.organization.create({
            data: { name: "Used it", slug: `coupons-used-${tag}` },
        });
        await prisma.pricingCouponRedemption.create({
            data: { couponId: c.id, organizationId: o.id, discountPaise: 111 },
        });

        const on = await controller.updateCoupon(me(), c.id, {
            active: true,
            maxRedemptions: 5,
            reason: "fake resume",
            idempotencyKey: key(),
        } as never);
        expect(on).toMatchObject({ active: true, maxRedemptions: 5, uses: 1 });

        await expect(
            controller.updateCoupon(me(), c.id, {
                maxRedemptions: 1,
                reason: "fake",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({ maxRedemptions: 1 });
        await prisma.pricingCouponRedemption.create({
            data: {
                couponId: c.id,
                organizationId: (
                    await prisma.organization.create({
                        data: { name: "Second", slug: `coupons-2-${tag}` },
                    })
                ).id,
                discountPaise: 111,
            },
        });
        await expect(
            controller.updateCoupon(me(), c.id, {
                maxRedemptions: 1,
                reason: "fake",
                idempotencyKey: key(),
            } as never),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("takes, returns, changes and clears a Razorpay offer id, auditing each change", async () => {
        const c = await create({ razorpayOfferId: "offer_ABCDEFGHIJKLMN" });
        expect(c.razorpayOfferId).toBe("offer_ABCDEFGHIJKLMN");
        expect(
            await prisma.adminAuditEvent.findFirstOrThrow({
                where: { action: "pricing.coupon.create" },
            }),
        ).toMatchObject({
            metadata: expect.objectContaining({
                razorpayOfferId: "offer_ABCDEFGHIJKLMN",
            }),
        });
        expect((await controller.listCoupons(null))[0]).toMatchObject({
            razorpayOfferId: "offer_ABCDEFGHIJKLMN",
        });

        const changed = await controller.updateCoupon(me(), c.id, {
            razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
            reason: "fake new offer",
            idempotencyKey: key(),
        } as never);
        expect(changed).toMatchObject({
            code: "FAKE-111",
            razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
        });

        // A change to something else leaves it as it was. (Months are the
        // Offer's terms too: changing them needs a new Offer, below.)
        await expect(
            controller.updateCoupon(me(), c.id, {
                maxRedemptions: 4,
                reason: "fake uses",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({ razorpayOfferId: "offer_NOPQRSTUVWXYZ1" });

        const cleared = await controller.updateCoupon(me(), c.id, {
            razorpayOfferId: null,
            reason: "fake unlink",
            idempotencyKey: key(),
        } as never);
        expect(cleared.razorpayOfferId).toBeNull();

        const updates = await prisma.adminAuditEvent.findMany({
            where: { action: "pricing.coupon.update", targetId: c.id },
            orderBy: { createdAt: "asc" },
        });
        const metadata = updates.map((u) => u.metadata);
        expect(metadata).toHaveLength(3);
        expect(metadata).toEqual(
            expect.arrayContaining([
                { code: "FAKE-111", razorpayOfferId: "offer_NOPQRSTUVWXYZ1" },
                { code: "FAKE-111", maxRedemptions: 4 },
                { code: "FAKE-111", razorpayOfferId: null },
            ]),
        );
    });

    it("refuses a change to what it takes off while it names the same Razorpay offer (F7)", async () => {
        const c = await create({ razorpayOfferId: "offer_ABCDEFGHIJKLMN" });
        for (const change of [
            { months: 3 },
            { discountPaise: 112 },
            { discountPaise: 0, percentOff: 7 },
            { planIds: ["b", "c"] },
        ]) {
            await expect(
                controller.updateCoupon(me(), c.id, {
                    ...change,
                    reason: "fake terms",
                    idempotencyKey: key(),
                } as never),
            ).rejects.toMatchObject({
                status: 400,
                response: { details: { field: "razorpayOfferId" } },
            });
        }
        // The same values again, or plans in another order, change nothing.
        await expect(
            controller.updateCoupon(me(), c.id, {
                months: 2,
                discountPaise: 111,
                planIds: ["b"],
                reason: "fake same",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({ months: 2 });
        // With a new Offer made for the new terms, it saves.
        await expect(
            controller.updateCoupon(me(), c.id, {
                months: 3,
                razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
                reason: "fake new offer",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({
            months: 3,
            razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
        });
        // A coupon with no Offer (Global's, say) changes freely.
        const plain = await create({ code: "FAKE-PLAIN" });
        await expect(
            controller.updateCoupon(me(), plain.id, {
                months: 3,
                reason: "fake months",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({ months: 3 });
    });

    it("refuses a coupon that would take a yearly charge below one month's price (F11)", async () => {
        const b = fakeCatalog().plans.find((p) => p.id === "b")!;
        const paid = fakeCatalog().yearly.paid;
        // Its months' worth leaves less than one month of the year to pay.
        await expect(
            create({
                code: "FAKE-YEAR",
                discountPaise: b.pricePaise,
                months: paid,
            }),
        ).rejects.toMatchObject({
            status: 400,
            response: { details: { field: "months" } },
        });
        await expect(
            create({
                code: "FAKE-YEAR-OK",
                discountPaise: b.pricePaise,
                months: paid - 1,
            }),
        ).resolves.toMatchObject({ months: paid - 1 });
    });

    it("refuses a Razorpay offer id in another shape, on create and on update", async () => {
        await expect(
            create({ razorpayOfferId: "offer_short" }),
        ).rejects.toMatchObject({
            status: 400,
            response: { details: { field: "razorpayOfferId" } },
        });
        expect(await prisma.pricingCoupon.count()).toBe(0);
        const c = await create();
        await expect(
            controller.updateCoupon(me(), c.id, {
                razorpayOfferId: "plan_ABCDEFGHIJKLMNO",
                reason: "fake",
                idempotencyKey: key(),
            } as never),
        ).rejects.toMatchObject({ status: 400 });
        expect(
            (
                await prisma.pricingCoupon.findUniqueOrThrow({
                    where: { id: c.id },
                })
            ).razorpayOfferId,
        ).toBeNull();
    });

    it("deletes an unused coupon, and archives a used one keeping its redemptions", async () => {
        const unused = await create({ code: "UNUSED-1" });
        await expect(
            controller.deleteCoupon(me(), unused.id, {
                reason: "fake delete",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({ outcome: "deleted" });
        expect(
            await prisma.pricingCoupon.count({ where: { id: unused.id } }),
        ).toBe(0);

        const used = await create({ code: "USED-1" });
        const o = await prisma.organization.create({
            data: { name: "Redeemer", slug: `coupons-r-${tag}` },
        });
        await prisma.pricingCouponRedemption.create({
            data: {
                couponId: used.id,
                organizationId: o.id,
                discountPaise: 111,
            },
        });
        await expect(
            controller.deleteCoupon(me(), used.id, {
                reason: "fake delete",
                idempotencyKey: key(),
            } as never),
        ).resolves.toMatchObject({ outcome: "archived" });
        const row = await prisma.pricingCoupon.findUniqueOrThrow({
            where: { id: used.id },
        });
        expect(row.archivedAt).not.toBeNull();
        expect(row.active).toBe(false);
        expect(
            await prisma.pricingCouponRedemption.count({
                where: { couponId: used.id },
            }),
        ).toBe(1);
        // Gone from the list, and its code stays taken.
        expect((await controller.listCoupons(null)).map((x) => x.code)).toEqual(
            [],
        );
        await expect(create({ code: "used-1" })).rejects.toMatchObject({
            status: 409,
        });
        // An archived coupon can't be changed.
        await expect(
            controller.updateCoupon(me(), used.id, {
                active: true,
                reason: "fake",
                idempotencyKey: key(),
            } as never),
        ).rejects.toMatchObject({ status: 404 });
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    action: {
                        in: ["pricing.coupon.delete", "pricing.coupon.archive"],
                    },
                },
            }),
        ).toBe(2);
    });

    describe("applies automatically", () => {
        const OFFER = "offer_ABCDEFGHIJKLMN";
        const auto = (over: Record<string, unknown> = {}) =>
            create({
                automatic: true,
                active: true,
                razorpayOfferId: OFFER,
                ...over,
            });

        it("one active automatic coupon per plan: a second is refused on its field, a paused one or another plan's is fine", async () => {
            const first = await auto({ code: "AUTO-B", planIds: ["b"] });
            expect(first).toMatchObject({ automatic: true, active: true });
            await expect(
                auto({ code: "AUTO-B2", planIds: ["b", "c"] }),
            ).rejects.toMatchObject({
                status: 409,
                response: { details: { field: "automatic" } },
            });
            // Paused, it can be made; resuming it while the first runs can't.
            const paused = await auto({
                code: "AUTO-B3",
                planIds: ["b"],
                active: false,
            });
            await expect(
                controller.updateCoupon(me(), paused.id, {
                    active: true,
                    reason: "fake",
                    idempotencyKey: key(),
                } as never),
            ).rejects.toMatchObject({ status: 409 });
            await expect(
                auto({ code: "AUTO-C", planIds: ["c"] }),
            ).resolves.toMatchObject({ automatic: true });
            // Turning the first one off frees the plan.
            await controller.updateCoupon(me(), first.id, {
                automatic: false,
                reason: "fake",
                idempotencyKey: key(),
            } as never);
            await expect(
                controller.updateCoupon(me(), paused.id, {
                    active: true,
                    reason: "fake",
                    idempotencyKey: key(),
                } as never),
            ).resolves.toMatchObject({ active: true, automatic: true });
            expect(
                await prisma.adminAuditEvent.findFirstOrThrow({
                    where: {
                        action: "pricing.coupon.update",
                        targetId: first.id,
                    },
                }),
            ).toMatchObject({
                metadata: expect.objectContaining({ automatic: false }),
            });
        });

        it("a percent coupon covers Grow and Pro at once, and the pricing page gets each plan's amount and the percent", async () => {
            const made = await auto({
                code: "AUTO-PCT",
                planIds: ["b", "c"],
                discountPaise: 0,
                percentOff: 7,
            });
            expect(made).toMatchObject({ discountPaise: 0, percentOff: 7 });
            const body = await new CatalogueService(
                new ImpactService(),
            ).publicPricing("INDIA", new Date());
            const price = (id: string) =>
                body.catalog.plans.find((p) => p.id === id)!.pricePaise;
            expect(body.offers).toEqual(
                ["b", "c"].map((planId) => ({
                    planId,
                    discountPaise: Math.floor((price(planId) * 7 + 50) / 100),
                    months: 2,
                    percentOff: 7,
                })),
            );
            // Back to an amount: the percent goes with it. New terms need a
            // new Offer, or the Offer-terms lock refuses the change.
            await expect(
                controller.updateCoupon(me(), made.id, {
                    discountPaise: 111,
                    percentOff: null,
                    razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
                    reason: "fake",
                    idempotencyKey: key(),
                } as never),
            ).resolves.toMatchObject({
                discountPaise: 111,
                percentOff: null,
                razorpayOfferId: "offer_NOPQRSTUVWXYZ1",
            });
        });

        it("an amount or a percent, never both or neither, and the percent 1 to 90", async () => {
            for (const over of [
                { discountPaise: 111, percentOff: 7 },
                { discountPaise: 0 },
            ]) {
                await expect(
                    create({ code: `BAD-${++n}`, ...over }),
                ).rejects.toMatchObject({
                    status: 400,
                    response: { details: { field: "discountPaise" } },
                });
            }
            await expect(
                create({
                    code: `BAD-${++n}`,
                    discountPaise: 0,
                    percentOff: 91,
                }),
            ).rejects.toMatchObject({
                status: 400,
                response: { details: { field: "percentOff" } },
            });
        });

        it("needs its Razorpay offer on India's", async () => {
            await expect(
                auto({ code: "NO-OFFER", razorpayOfferId: undefined }),
            ).rejects.toMatchObject({
                status: 400,
                response: { details: { field: "razorpayOfferId" } },
            });
        });

        it("shows on the public pricing as an amount and months only, never its code", async () => {
            await auto({ code: "AUTO-SHOWN", planIds: ["b"] });
            await create({ code: "TYPED-ONLY", planIds: ["c"], active: true });
            const body = await new CatalogueService(
                new ImpactService(),
            ).publicPricing("INDIA", new Date());
            expect(body.offers).toEqual([
                { planId: "b", discountPaise: 111, months: 2 },
            ]);
            expect(JSON.stringify(body)).not.toContain("AUTO-SHOWN");
        });
    });
});
