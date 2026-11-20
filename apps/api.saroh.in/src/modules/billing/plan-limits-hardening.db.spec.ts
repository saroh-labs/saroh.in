/**
 * The owner's hard limits of 20 Nov 2026 (DEC-227) against a real Postgres:
 *
 * - storage follows its catalogue cell: a hard cell refuses an upload at
 *   its start, at the size it says, and again at confirm with the real
 *   size; uploads started side by side can't pass it; a soft cell only
 *   tells; the sweep removes stale unconfirmed uploads and nothing else;
 * - the site's checkout follows the orders cell: hard refuses past it with
 *   the customer's words, even in a race at the limit; soft takes the order
 *   and tells;
 * - one business on Free per person, with staff's exception, and a set-up
 *   limit per person;
 * - the free trial and the launch discount are once per person and GSTIN.
 *
 * Every catalogue is made up (`fakeMeteredCatalog`, small fake caps).
 * Integration project (TEST_DATABASE_URL).
 */
import {
    ConflictException,
    ForbiddenException,
    HttpException,
} from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { FlagKey } from "../feature-flags/flags";
import { MediaService } from "../media/media.service";
import {
    PENDING_UPLOAD_STALE_MS,
    PendingUploadSweepJob,
} from "../media/pending-upload-sweep.job";
import { createCheckoutOrder } from "../orders/checkout-order";
import type { CheckoutStartDto } from "../orders/checkout.dto";
import {
    assertMayOwnAnotherFreeInTx,
    FREE_BUSINESS_TAKEN_MESSAGE,
} from "../organizations/free-business";
import { OrganizationOnboardingService } from "../organizations/organization-onboarding.service";
import {
    automaticCouponFor,
    hadPaidPlanOrLaunchOffer,
} from "../pricing/coupons.service";
import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import { PLAN_LIMIT_NOTICE_TYPE } from "./metering.service";
import { trialTakenBy } from "./offers";
import { ORDERS_PAUSED_MESSAGE } from "./plan-limit-errors";

const tag = `${process.pid}-${Date.now()}`;
const HARD = 830_000 + Math.floor(Math.random() * 9_000);
const SOFT = HARD + 10_000;
const MINUTE = 60_000;
const MB = 1_000_000;

let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

/** Storage on Plan A: a fraction of a GB, hard or soft; orders likewise. */
function catalogue(soft: boolean): Catalog {
    return fakeMeteredCatalog((c) => {
        for (const m of c.modules) {
            const cell = m.cells.free;
            if (!cell?.inc) continue;
            if (m.id === "storage") {
                cell.limit = 0.02;
                cell.soft = soft;
            }
            if (m.id === "orders") cell.soft = soft;
        }
    });
}

async function install(version: number, catalog: Catalog) {
    await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * MINUTE),
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

async function person(over: { extraFreeBusinesses?: number } = {}) {
    return prisma.user.create({
        data: { email: `${uniq("p")}@example.com`, name: "Asha", ...over },
    });
}

/** A business on Plan A (or another plan) of `version`, enforcement on. */
async function business(
    version: number,
    over: { planId?: string; ownerId?: string } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Limited", slug: uniq("lim") },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${over.planId ?? "free"}`,
                version,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.PLAN_ENFORCEMENT,
            organizationId: org.id,
            enabled: true,
        },
    });
    const owner = over.ownerId ?? (await person()).id;
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner, role: "OWNER" },
    });
    const store = await prisma.store.create({
        data: { name: "Shop", slug: uniq("shop"), organizationId: org.id },
    });
    return { orgId: org.id, storeId: store.id, ownerId: owner };
}

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
    });
    await install(HARD, catalogue(false));
    await install(SOFT, catalogue(true));
});

afterAll(async () => {
    await prisma.$disconnect();
});

// ── Storage ────────────────────────────────────────────────────────────

function storage(over: Partial<ObjectStorage> = {}): ObjectStorage {
    return {
        createSignedUploadUrl: jest.fn().mockImplementation(() => {
            const key = uniq("org/key");
            return Promise.resolve({
                url: `https://storage.test/${key}`,
                method: "PUT",
                key,
                headers: {},
                expiresAt: new Date(Date.now() + 10 * MINUTE).toISOString(),
                maxContentLength: 0,
            });
        }),
        createSignedDownloadUrl: jest.fn(),
        getPublicUrl: jest.fn().mockReturnValue(null),
        deleteObject: jest.fn().mockResolvedValue(undefined),
        headObject: jest.fn().mockResolvedValue(null),
        readObjectStart: jest.fn().mockResolvedValue(null),
        putObject: jest.fn(),
        seesUploads: false,
        ...over,
    } as ObjectStorage;
}

const ctxOf = (b: { orgId: string; ownerId: string }): OrganizationContext => ({
    organizationId: b.orgId,
    userId: b.ownerId,
    role: "OWNER",
});

const photo = (bytes: number) => ({
    contentType: "image/png",
    contentLength: bytes,
    filename: "p.png",
});

describe("storage follows its catalogue cell (DEC-227)", () => {
    it("refuses an upload at its start when a hard cell would be passed, writing nothing", async () => {
        const b = await business(HARD);
        const media = new MediaService(storage());
        await media.createUpload(ctxOf(b), photo(9 * MB));
        await media.createUpload(ctxOf(b), photo(9 * MB));
        await expect(
            media.createUpload(ctxOf(b), photo(9 * MB)),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(
            await prisma.media.count({ where: { organizationId: b.orgId } }),
        ).toBe(2);
    });

    it("lets uploads started side by side pass the cap no further than one at a time would", async () => {
        const b = await business(HARD);
        const media = new MediaService(storage());
        const results = await Promise.allSettled(
            [0, 1, 2, 3].map(() => media.createUpload(ctxOf(b), photo(9 * MB))),
        );
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    });

    it("refuses at confirm when the real size passes, fails the upload and deletes its object", async () => {
        const b = await business(HARD);
        const real = 9.9 * MB;
        const store = storage({
            headObject: jest.fn().mockResolvedValue({
                key: "k",
                contentType: "image/png",
                contentLength: real,
            }),
        });
        const media = new MediaService(store);
        const started = await media.createUpload(ctxOf(b), photo(9 * MB));
        await prisma.media.create({
            data: {
                organizationId: b.orgId,
                key: uniq("ready"),
                contentType: "image/png",
                sizeBytes: 9 * MB,
                filename: "r.png",
                status: "READY",
            },
        });
        await expect(
            media.completeUpload(ctxOf(b), started.mediaId),
        ).rejects.toBeInstanceOf(ForbiddenException);
        const row = await prisma.media.findUniqueOrThrow({
            where: { id: started.mediaId },
        });
        expect(row.status).toBe("FAILED");
        expect(store.deleteObject).toHaveBeenCalledWith(started.key);
    });

    it("on a soft cell, takes every upload and tells the business once it passes", async () => {
        const b = await business(SOFT);
        const media = new MediaService(storage());
        for (let i = 0; i < 3; i++) {
            await media.createUpload(ctxOf(b), photo(9 * MB));
        }
        expect(
            await prisma.media.count({ where: { organizationId: b.orgId } }),
        ).toBe(3);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.orgId,
                    type: PLAN_LIMIT_NOTICE_TYPE,
                },
            }),
        ).toBeGreaterThan(0);
    });

    it("sweeps stale unconfirmed uploads, and nothing confirmed, fresh or held", async () => {
        const b = await business(HARD);
        const held = await business(HARD);
        await prisma.organization.update({
            where: { id: held.orgId },
            data: { legalHoldAt: new Date() },
        });
        const old = new Date(Date.now() - PENDING_UPLOAD_STALE_MS - MINUTE);
        const row = (orgId: string, status: string, createdAt: Date) =>
            prisma.media.create({
                data: {
                    organizationId: orgId,
                    key: uniq("k"),
                    contentType: "image/png",
                    sizeBytes: MB,
                    filename: "x.png",
                    status,
                    createdAt,
                },
            });
        const stale = await row(b.orgId, "PENDING", old);
        const fresh = await row(b.orgId, "PENDING", new Date());
        const ready = await row(b.orgId, "READY", old);
        const kept = await row(held.orgId, "PENDING", old);
        const store = storage();
        const sweep = new PendingUploadSweepJob(store);
        const r = await sweep.sweep(new Date());
        expect(r.removed).toBeGreaterThanOrEqual(1);
        const left = await prisma.media.findMany({
            where: { id: { in: [stale.id, fresh.id, ready.id, kept.id] } },
            select: { id: true },
        });
        expect(left.map((m) => m.id).sort()).toEqual(
            [fresh.id, ready.id, kept.id].sort(),
        );
        expect(store.deleteObject).toHaveBeenCalledWith(stale.key);
        expect(store.deleteObject).not.toHaveBeenCalledWith(kept.key);
    });
});

// ── Orders from the site's checkout ────────────────────────────────────

async function siteOrder(b: { orgId: string; storeId: string }) {
    const email = `${uniq("buyer")}@example.com`;
    const contact = await prisma.contact.create({
        data: { organizationId: b.orgId, email },
    });
    return createCheckoutOrder(
        {
            organizationId: b.orgId,
            storefront: { id: b.storeId, name: "Shop" },
        },
        {
            accountId: null,
            email,
            contactId: contact.id,
            firstName: "Ravi",
            lastName: null,
        },
        {
            lines: [],
            type: "PICKUP",
            shippingCents: 0,
            currency: "INR",
            dto: {
                lines: [],
                fulfilment: "PICKUP",
                key: uniq("key").replace(/[^A-Za-z0-9_-]/g, "_"),
            } as unknown as CheckoutStartDto,
            // Pay on collection counts from the start (R30).
            payOnHandover: true,
        },
    );
}

describe("the site's checkout follows the orders cell (DEC-227)", () => {
    it("refuses past a hard monthly cap in the customer's words, even four at once", async () => {
        const b = await business(HARD);
        const results = await Promise.allSettled(
            [0, 1, 2, 3].map(() => siteOrder(b)),
        );
        // Plan A's fake cap is 2 a month.
        const taken = results.filter((r) => r.status === "fulfilled");
        expect(taken).toHaveLength(2);
        for (const r of results) {
            if (r.status === "rejected") {
                expect(r.reason).toBeInstanceOf(ConflictException);
                expect((r.reason as ConflictException).message).toBe(
                    ORDERS_PAUSED_MESSAGE,
                );
            }
        }
        expect(
            await prisma.order.count({ where: { organizationId: b.orgId } }),
        ).toBe(2);
    });

    it("takes every order on a soft cell and tells the business", async () => {
        const b = await business(SOFT);
        for (let i = 0; i < 3; i++) await siteOrder(b);
        expect(
            await prisma.order.count({ where: { organizationId: b.orgId } }),
        ).toBe(3);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.orgId,
                    type: PLAN_LIMIT_NOTICE_TYPE,
                },
            }),
        ).toBeGreaterThan(0);
    });
});

// ── One business on Free per person ───────────────────────────────────

describe("one business on Free per person (DEC-227, M-4)", () => {
    const onboarding = () => {
        const o = new OrganizationOnboardingService(new AuditService());
        o.creations = null;
        return o;
    };
    const make = (o: OrganizationOnboardingService, userId: string) =>
        o.onboard(userId, { name: "Asha's Kitchen", address: uniq("asha") });

    it("refuses a second business while the first is on Free, saying what to do", async () => {
        const o = onboarding();
        const owner = await person();
        await make(o, owner.id);
        await expect(make(o, owner.id)).rejects.toThrow(
            FREE_BUSINESS_TAKEN_MESSAGE,
        );
    });

    it("lets a person with staff's exception own one more", async () => {
        const o = onboarding();
        const owner = await person({ extraFreeBusinesses: 1 });
        await make(o, owner.id);
        await make(o, owner.id);
        await expect(make(o, owner.id)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("counts only businesses they own that stand and aren't on a paid plan", async () => {
        const owner = await person();
        // On a paid plan: doesn't count.
        await business(HARD, { planId: "grow", ownerId: owner.id });
        // Deleted: doesn't count.
        const gone = await business(HARD, { ownerId: owner.id });
        await prisma.organization.update({
            where: { id: gone.orgId },
            data: { lifecycleStatus: "DELETED_RETAINED" },
        });
        // A member of someone else's Free business: doesn't count.
        const other = await business(HARD);
        await prisma.membership.create({
            data: {
                organizationId: other.orgId,
                userId: owner.id,
                role: "ADMIN",
            },
        });
        await make(onboarding(), owner.id);
    });

    it("lets only one of two set-ups at once through", async () => {
        const o = onboarding();
        const owner = await person();
        const results = await Promise.allSettled([
            make(o, owner.id),
            make(o, owner.id),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });

    it("refuses moving a paid business down to Free while its owner has another on Free", async () => {
        const owner = await person();
        await business(HARD, { ownerId: owner.id });
        const paid = await business(HARD, {
            planId: "grow",
            ownerId: owner.id,
        });
        await expect(
            prisma.$transaction((tx) =>
                assertMayOwnAnotherFreeInTx(tx, [owner.id], paid.orgId),
            ),
        ).rejects.toThrow(FREE_BUSINESS_TAKEN_MESSAGE);
        // Its own Free business alone never stops it.
        const solo = await person();
        const only = await business(HARD, { planId: "grow", ownerId: solo.id });
        await prisma.$transaction((tx) =>
            assertMayOwnAnotherFreeInTx(tx, [solo.id], only.orgId),
        );
    });

    it("limits how many businesses one person sets up in a day", async () => {
        const o = onboarding();
        o.creations = new FixedWindowRateLimiter(1, 24 * 60 * MINUTE);
        const owner = await person({ extraFreeBusinesses: 5 });
        await make(o, owner.id);
        const second = make(o, owner.id);
        await expect(second).rejects.toBeInstanceOf(HttpException);
        await expect(second).rejects.toMatchObject({ status: 429 });
    });
});

// ── Trial and launch discount once per person ─────────────────────────

describe("the trial and the launch discount are once per person (DEC-227, M-2, M-3)", () => {
    async function trialDone(orgId: string) {
        const plan = await prisma.plan.findFirstOrThrow({
            where: { version: HARD },
        });
        await prisma.billingCheckout.create({
            data: {
                organizationId: orgId,
                planId: plan.id,
                cycle: "month",
                kind: "TRIAL",
                status: "COMPLETED",
                provider: "razorpay",
                providerSubscriptionId: uniq("sub"),
                providerPlanId: uniq("plan"),
                pricePaise: 100,
                expiresAt: new Date(),
            },
        });
    }

    it("withholds a trial from another business of the same owner or GSTIN, and says so", async () => {
        const owner = await person();
        const first = await business(HARD, { ownerId: owner.id });
        await trialDone(first.orgId);
        const second = await business(HARD, { ownerId: owner.id });
        expect(await trialTakenBy(prisma, first.orgId)).toBe("this");
        expect(await trialTakenBy(prisma, second.orgId)).toBe("other");

        const gstin = "29ABCDE1234F1Z5";
        await prisma.businessProfile.create({
            data: { organizationId: first.orgId, taxId: gstin },
        });
        const sameGstin = await business(HARD);
        await prisma.businessProfile.create({
            data: { organizationId: sameGstin.orgId, taxId: gstin },
        });
        expect(await trialTakenBy(prisma, sameGstin.orgId)).toBe("other");

        const stranger = await business(HARD);
        expect(await trialTakenBy(prisma, stranger.orgId)).toBeNull();
    });

    it("withholds the launch discount from another business of the same owner, and says why", async () => {
        const owner = await person();
        const first = await business(HARD, { ownerId: owner.id });
        const coupon = await prisma.pricingCoupon.create({
            data: {
                code: uniq("LAUNCH")
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, ""),
                discountPaise: 100,
                months: 3,
                maxRedemptions: 1000,
                automatic: true,
                planIds: ["grow"],
            },
        });
        await prisma.pricingCouponRedemption.create({
            data: {
                couponId: coupon.id,
                organizationId: first.orgId,
                discountPaise: 300,
            },
        });
        const second = await business(HARD, { ownerId: owner.id });
        expect(await hadPaidPlanOrLaunchOffer(second.orgId)).toBe("other");
        const asked = await automaticCouponFor({
            organizationId: second.orgId,
            edition: "INDIA",
            planId: "grow",
            planName: "Plan B",
            now: new Date(),
        });
        expect(asked).toEqual({ coupon: null, elsewhere: true });

        const stranger = await business(HARD);
        expect(await hadPaidPlanOrLaunchOffer(stranger.orgId)).toBeNull();
    });
});
