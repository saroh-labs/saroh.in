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
        expect((await controller.listCoupons()).map((x) => x.code)).toEqual([
            "FAKE-111",
        ]);
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
        expect((await controller.listCoupons()).map((x) => x.code)).toEqual([]);
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
});
