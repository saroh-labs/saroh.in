/**
 * Metering and enforcement (plans catalogue U13) against a real Postgres:
 * what each limit counts (`metering.ts`) — the business's month in its own
 * zone, only orders and bookings that stand — for one business and for
 * many at once (the admin's `ImpactService`); `MeteringService`'s answers
 * behind the `PLAN_ENFORCEMENT` kill switch; the 80% / 100% notices; the
 * usage `GET …/billing/access` shows; and two writes racing for the last
 * place.
 *
 * Every catalogue here is made up (`fakeMeteredCatalog`: Plan A/B/C, caps
 * of 1–5). The switch is turned on per business (an override), never
 * globally, so other specs running beside this one are untouched. Runs in
 * the integration project (TEST_DATABASE_URL), plain and RLS.
 */
import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import {
    backendPid,
    gate,
    waitUntilAdvisoryBlockedBy,
} from "../../../test/lock-wait";
import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { ImpactService } from "../pricing/impact.service";
import { CatalogueAccessService } from "./catalogue-access.service";
import type { MeteredLimitKey } from "./metering";
import { countUsage, monthFirstDay, monthWindow } from "./metering";
import { countUsageAcross } from "./metering-across";
import { MeteringService, PLAN_LIMIT_NOTICE_TYPE } from "./metering.service";
import {
    PLAN_LIMIT_NOTIFICATION_TYPE,
    PlanLimitNoticeHandler,
} from "./plan-limit-notice.handler";

const tag = `${process.pid}-${Date.now()}`;
const V = 810_000 + Math.floor(Math.random() * 9_000);
const MINUTE = 60_000;

const access = new CatalogueAccessService();
const flags = new FeatureFlagService();
const meter = new MeteringService(access, flags);
const handler = new PlanLimitNoticeHandler(access, meter);

let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

async function install(version: number, catalog: Catalog) {
    await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * MINUTE),
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

/** A business on `planId`@V, with the kill switch on (or not) for it alone. */
async function business(
    planId: string | null,
    over: { enforce?: boolean; zone?: string } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Metered", slug: uniq("meter") },
    });
    if (planId) {
        const plan = await prisma.plan.findUniqueOrThrow({
            where: {
                key_version_interval: {
                    key: `catalog.${planId}`,
                    version: V,
                    interval: "month",
                },
            },
        });
        await prisma.subscription.create({
            data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
        });
    }
    // An override needs the flag's definition row (FeatureFlagOverride_flagKey_fkey).
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
    });
    if (over.enforce ?? true) {
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: FlagKey.PLAN_ENFORCEMENT,
                organizationId: org.id,
                enabled: true,
            },
        });
    }
    if (over.zone) {
        await prisma.businessProfile.create({
            data: { organizationId: org.id, timezone: over.zone },
        });
    }
    const store = await prisma.store.create({
        data: {
            name: "Counter",
            slug: uniq("meter-store"),
            organizationId: org.id,
        },
    });
    return { orgId: org.id, storeId: store.id };
}

async function product(
    organizationId: string,
    status = "PUBLISHED",
    db: Pick<Prisma.TransactionClient, "product"> = prisma,
) {
    return db.product.create({
        data: {
            organizationId,
            name: "Loaf",
            slug: uniq("loaf"),
            price: "10.00",
            status,
        },
    });
}

async function order(
    organizationId: string,
    storeId: string,
    over: Partial<Prisma.OrderUncheckedCreateInput> = {},
) {
    return prisma.order.create({
        data: {
            storeId,
            organizationId,
            orderId: uniq("ORD"),
            subtotal: "10.00",
            total: "10.00",
            currency: "INR",
            ...over,
        },
    });
}

async function booking(
    organizationId: string,
    over: Partial<Prisma.BookingUncheckedCreateInput> = {},
) {
    const service = await prisma.service.create({
        data: {
            organizationId,
            name: "Session",
            durationMinutes: 30,
            capacity: 1,
            timezone: "Asia/Kolkata",
        },
    });
    const start = new Date(Date.now() + 7 * 24 * 60 * MINUTE);
    return prisma.booking.create({
        data: {
            organizationId,
            serviceId: service.id,
            startAt: start,
            endAt: new Date(start.getTime() + 30 * MINUTE),
            timezone: "Asia/Kolkata",
            snapshot: {},
            bookerEmail: `${uniq("b")}@example.test`,
            ...over,
        },
    });
}

/** A location customers visit (`StoreSettings.kind` SHOP). */
async function shop(
    organizationId: string,
    over: Partial<Prisma.StoreUncheckedCreateInput> = {},
) {
    return prisma.store.create({
        data: {
            name: "Counter",
            organizationId,
            settings: { create: { kind: "SHOP" } },
            ...over,
        },
    });
}

/** An uploaded file of `sizeBytes`. */
async function media(
    organizationId: string,
    sizeBytes: number,
    status: string,
) {
    return prisma.media.create({
        data: {
            organizationId,
            key: uniq("media"),
            contentType: "image/png",
            filename: "a.png",
            sizeBytes,
            status,
        },
    });
}

/** One rollup row: the org-wide site views for `date`, unless told otherwise. */
async function views(
    organizationId: string,
    date: Date,
    count: number,
    over: Partial<Prisma.AnalyticsDailyAggregateUncheckedCreateInput> = {},
) {
    return prisma.analyticsDailyAggregate.create({
        data: {
            organizationId,
            date,
            type: "site.view",
            count,
            ...over,
        },
    });
}

const owner = (organizationId: string): OrganizationContext => ({
    organizationId,
    userId: "user",
    role: "OWNER",
});

/** The refusal's `details`, as the error filter would send them. */
function detailsOf(err: unknown): Record<string, unknown> {
    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
    return { message: body.message, ...body.details };
}

async function refusal(p: Promise<unknown>): Promise<Record<string, unknown>> {
    try {
        await p;
    } catch (err) {
        return detailsOf(err);
    }
    throw new Error("expected a refusal");
}

const add = (orgId: string, moduleId: string, adding = 1) =>
    prisma.$transaction((tx) =>
        meter.roomInTx(tx, orgId, moduleId, { adding }),
    );

beforeAll(async () => {
    await install(V, fakeMeteredCatalog());
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("what each limit counts (DB, U13)", () => {
    it("counts products that aren't archived", async () => {
        const { orgId } = await business("free");
        await product(orgId);
        await product(orgId, "DRAFT");
        await product(orgId, "ARCHIVED");
        expect(await countUsage(prisma, orgId, "products")).toBe(2);
    });

    it("counts orders that stand this month in the business's zone", async () => {
        const { orgId, storeId } = await business("free", {
            zone: "Asia/Kolkata",
        });
        const { start } = monthWindow(new Date(), "Asia/Kolkata");
        // This month in India, though the same UTC day as last month's.
        await order(orgId, storeId, {
            createdAt: new Date(start.getTime() + 15 * MINUTE),
        });
        // Last month in India: not counted.
        await order(orgId, storeId, {
            createdAt: new Date(start.getTime() - 15 * MINUTE),
        });
        await order(orgId, storeId, { status: "CANCELLED" });
        // An online checkout nobody paid isn't an order yet (OQ-7)…
        await order(orgId, storeId, { placedOnline: true });
        // …and once paid it is.
        await order(orgId, storeId, {
            placedOnline: true,
            paidAt: new Date(),
            paymentStatus: "PAID",
        });
        expect(await countUsage(prisma, orgId, "ordersPerMonth")).toBe(2);
    });

    it("counts bookings that stand this month in the business's zone", async () => {
        const { orgId } = await business("free", { zone: "Asia/Kolkata" });
        const { start } = monthWindow(new Date(), "Asia/Kolkata");
        await booking(orgId, {
            createdAt: new Date(start.getTime() + 15 * MINUTE),
        });
        await booking(orgId, {
            createdAt: new Date(start.getTime() - 15 * MINUTE),
        });
        await booking(orgId, { status: "CANCELLED" });
        // A pay-now hold isn't a booking until it is paid.
        await booking(orgId, {
            status: "PENDING",
            holdExpiresAt: new Date(Date.now() + 15 * MINUTE),
        });
        expect(await countUsage(prisma, orgId, "bookingsPerMonth")).toBe(1);
    });

    it("starts the month at midnight in the business's zone, not UTC", () => {
        const now = new Date("2026-10-01T00:10:00+05:30");
        expect(monthWindow(now, "Asia/Kolkata")).toEqual({
            start: new Date("2026-09-30T18:30:00.000Z"),
            key: "2026-10",
        });
        // The same instant is still September in UTC.
        expect(monthWindow(now, "UTC").key).toBe("2026-09");
    });

    it("counts posts live on a site that isn't deleted", async () => {
        const { orgId } = await business("free");
        const site = await prisma.site.create({
            data: { organizationId: orgId, name: "Site", slug: uniq("s") },
        });
        const gone = await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Gone",
                slug: uniq("s"),
                deletedAt: new Date(),
            },
        });
        const live = async (siteId: string) => {
            const post = await prisma.post.create({
                data: { siteId, title: "Post", slug: uniq("p"), content: "" },
            });
            const pub = await prisma.publication.create({
                data: {
                    siteId,
                    organizationId: orgId,
                    postId: post.id,
                    snapshot: {},
                    templateId: "post",
                    templateVersion: 1,
                },
            });
            await prisma.post.update({
                where: { id: post.id },
                data: { currentPublicationId: pub.id, status: "PUBLISHED" },
            });
        };
        await live(site.id);
        await live(gone.id);
        await prisma.post.create({
            data: {
                siteId: site.id,
                title: "Draft",
                slug: uniq("p"),
                content: "",
                status: "PUBLISHED",
            },
        });
        expect(await countUsage(prisma, orgId, "blogPosts")).toBe(1);
    });

    it("counts people and open invitations", async () => {
        const { orgId } = await business("free");
        const user = await prisma.user.create({
            data: { email: `${uniq("m")}@example.test` },
        });
        await prisma.membership.create({
            data: { organizationId: orgId, userId: user.id, role: "OWNER" },
        });
        const invite = (status: string, expiresAt: Date) =>
            prisma.organizationInvitation.create({
                data: {
                    organizationId: orgId,
                    email: `${uniq("i")}@example.test`,
                    role: "MEMBER",
                    tokenHash: uniq("t"),
                    status,
                    expiresAt,
                },
            });
        const later = new Date(Date.now() + 60 * MINUTE);
        await invite("PENDING", later);
        await invite("PENDING", new Date(Date.now() - MINUTE));
        await invite("REVOKED", later);
        expect(await countUsage(prisma, orgId, "teamMembers")).toBe(2);
    });

    it("counts connected payment and messaging providers", async () => {
        const { orgId } = await business("free");
        const sealed = {
            encryptedCredentials: "x",
            credentialsIv: "x",
            credentialsAuthTag: "x",
        };
        await prisma.merchantPaymentProvider.create({
            data: { organizationId: orgId, provider: "CASHFREE", ...sealed },
        });
        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: orgId,
                provider: "RAZORPAY",
                status: "DISABLED",
                ...sealed,
            },
        });
        await prisma.communicationProvider.create({
            data: {
                organizationId: orgId,
                channel: "EMAIL",
                provider: "RESEND",
                ...sealed,
            },
        });
        expect(await countUsage(prisma, orgId, "integrations")).toBe(2);
    });

    it("leaves Reviewers out of the team, and counts them on their own cap", async () => {
        const { orgId } = await business("free");
        for (const role of ["OWNER", "REVIEWER"]) {
            const user = await prisma.user.create({
                data: { email: `${uniq("m")}@example.test` },
            });
            await prisma.membership.create({
                data: { organizationId: orgId, userId: user.id, role },
            });
        }
        for (const role of ["MEMBER", "REVIEWER"]) {
            await prisma.organizationInvitation.create({
                data: {
                    organizationId: orgId,
                    email: `${uniq("i")}@example.test`,
                    role,
                    tokenHash: uniq("t"),
                    status: "PENDING",
                    expiresAt: new Date(Date.now() + 60 * MINUTE),
                },
            });
        }
        expect(await countUsage(prisma, orgId, "teamMembers")).toBe(2);
        // The Reviewer in the business and the open Reviewer invitation.
        expect(await countUsage(prisma, orgId, "reviewers")).toBe(2);
    });

    it("counts live locations customers visit, never an online one", async () => {
        const { orgId, storeId } = await business("free");
        // `business` made an online one with no settings: not counted.
        expect(await countUsage(prisma, orgId, "shopLocations")).toBe(0);
        await shop(orgId);
        await shop(orgId, { deletedAt: new Date() });
        await prisma.storeSettings.create({
            data: { storeId, kind: "ONLINE" },
        });
        expect(await countUsage(prisma, orgId, "shopLocations")).toBe(1);
    });

    it("counts websites that aren't deleted", async () => {
        const { orgId } = await business("free");
        await prisma.site.create({
            data: { organizationId: orgId, name: "Site", slug: uniq("s") },
        });
        await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Gone",
                slug: uniq("s"),
                deletedAt: new Date(),
            },
        });
        expect(await countUsage(prisma, orgId, "sites")).toBe(1);
    });

    it("sums checked uploads in GB, rounded up to the hundredth", async () => {
        const { orgId } = await business("free");
        await media(orgId, 1_000_000_000, "READY");
        await media(orgId, 200_000_001, "READY");
        // Not stored: still uploading, or not what its type said.
        await media(orgId, 900_000_000, "PENDING");
        await media(orgId, 900_000_000, "FAILED");
        expect(await countUsage(prisma, orgId, "storageGb")).toBe(1.21);
    });

    it("counts this month's site views from the rollup's org-wide total", async () => {
        const { orgId } = await business("free", { zone: "Asia/Kolkata" });
        const first = monthFirstDay(new Date(), "Asia/Kolkata");
        const before = new Date(first.getTime() - 24 * 60 * MINUTE);
        await views(orgId, first, 5);
        await views(orgId, before, 50);
        // A per-site row and a path row repeat the total: never added twice.
        await views(orgId, first, 5, { siteId: "site_1" });
        await views(orgId, first, 3, {
            dimension: "path",
            dimensionValue: "/",
        });
        // Another event type isn't a visit.
        await views(orgId, first, 9, { type: "form.submit" });
        expect(await countUsage(prisma, orgId, "visitsPerMonth")).toBe(5);
    });

    it("counts many businesses at once as it counts one", async () => {
        const india = await business("free", { zone: "Asia/Kolkata" });
        const newYork = await business("free", { zone: "America/New_York" });
        const quiet = await business("free");
        for (const b of [india, newYork]) {
            const { start } = monthWindow(
                new Date(),
                b === india ? "Asia/Kolkata" : "America/New_York",
            );
            await product(b.orgId);
            await order(b.orgId, b.storeId, {
                createdAt: new Date(start.getTime() + MINUTE),
            });
            await order(b.orgId, b.storeId, {
                createdAt: new Date(start.getTime() - MINUTE),
            });
            await booking(b.orgId, {
                createdAt: new Date(start.getTime() + MINUTE),
            });
            await shop(b.orgId);
            await prisma.site.create({
                data: { organizationId: b.orgId, name: "S", slug: uniq("s") },
            });
            await media(b.orgId, 123_456_789, "READY");
            await views(
                b.orgId,
                monthFirstDay(
                    new Date(),
                    b === india ? "Asia/Kolkata" : "America/New_York",
                ),
                4,
            );
            // Saroh's emails (DEC-086): one this month, one before it.
            for (const at of [
                start.getTime() + MINUTE,
                start.getTime() - MINUTE,
            ]) {
                const message = await prisma.message.create({
                    data: {
                        organizationId: b.orgId,
                        channel: "EMAIL",
                        toAddress: "a@example.test",
                        body: "x",
                    },
                });
                await prisma.delivery.create({
                    data: {
                        organizationId: b.orgId,
                        messageId: message.id,
                        provider: "SAROH",
                        createdAt: new Date(at),
                    },
                });
            }
        }
        const ids = [india.orgId, newYork.orgId, quiet.orgId];
        const keys: MeteredLimitKey[] = [
            "products",
            "ordersPerMonth",
            "bookingsPerMonth",
            "blogPosts",
            "teamMembers",
            "reviewers",
            "integrations",
            "shopLocations",
            "sites",
            "storageGb",
            "visitsPerMonth",
            "sarohEmailsPerMonth",
        ];
        for (const key of keys) {
            const across = await countUsageAcross(prisma, key, ids);
            for (const id of ids) {
                expect([key, across.get(id) ?? 0]).toEqual([
                    key,
                    await countUsage(prisma, id, key),
                ]);
            }
        }
        // And the admin's usage lines read the same counts.
        const { businesses, measured } = await new ImpactService().read(
            new Set(["free", "grow", "pro"]),
            new Date(),
        );
        expect([...measured].sort()).toEqual(
            [
                "blog",
                "bookings",
                "integrations",
                "members",
                "orders",
                "products",
                "locations",
                "reviewers",
                "sites",
                "storage",
                "visits",
                "saroh-emails",
            ].sort(),
        );
        const row = businesses.find((b) => b.id === india.orgId);
        expect(row?.usage).toMatchObject({
            products: 1,
            orders: 1,
            bookings: 1,
        });
    });
});

describe("enforcement behind PLAN_ENFORCEMENT (DB, U13)", () => {
    it("refuses nothing and counts nothing with the switch off", async () => {
        const { orgId } = await business("free", { enforce: false });
        for (let i = 0; i < 4; i++) await product(orgId);
        await expect(add(orgId, "products")).resolves.toBeNull();
        await expect(
            meter.assertIncluded(orgId, "roles"),
        ).resolves.toBeUndefined();
    });

    it("never refuses a business the catalogue doesn't reach yet", async () => {
        const { orgId } = await business(null);
        for (let i = 0; i < 4; i++) await product(orgId);
        await expect(add(orgId, "products")).resolves.toBeNull();
    });

    it("lets the last one in, then refuses with the catalogue's words", async () => {
        const { orgId } = await business("free");
        await product(orgId);
        await product(orgId);
        await expect(add(orgId, "products")).resolves.toMatchObject({
            limit: 3,
            used: 2,
        });
        await product(orgId);
        expect(await refusal(add(orgId, "products"))).toMatchObject({
            message: "You've reached your 3 products on Plan A",
            code: "PLAN_LIMIT_REACHED",
            moduleId: "products",
            limitKey: "products",
            limit: 3,
            used: 3,
            plan: { id: "free", name: "Plan A" },
            upgradeTo: { planId: "grow", name: "Plan B" },
            notice: { cta: "Upgrade or add more" },
        });
    });

    it("refuses a batch that wouldn't fit, though one more would", async () => {
        const { orgId } = await business("free");
        await product(orgId);
        expect(await refusal(add(orgId, "products", 3))).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            used: 1,
        });
        await expect(add(orgId, "products", 2)).resolves.not.toBeNull();
    });

    it("refuses a row the plan leaves off, naming the plan that has it", async () => {
        const { orgId } = await business("free");
        expect(
            await refusal(meter.assertIncluded(orgId, "review")),
        ).toMatchObject({
            code: "MODULE_LOCKED",
            moduleId: "review",
            plan: { id: "free", name: "Plan A" },
            upgradeTo: { planId: "grow", name: "Plan B" },
        });
        const grow = await business("grow");
        await expect(
            meter.assertIncluded(grow.orgId, "review"),
        ).resolves.toBeUndefined();
    });

    it("leaves a business over its cap after a downgrade with what it has", async () => {
        const { orgId } = await business("grow");
        for (let i = 0; i < 5; i++) await product(orgId);
        const sub = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: orgId },
        });
        const free = await prisma.plan.findUniqueOrThrow({
            where: {
                key_version_interval: {
                    key: "catalog.free",
                    version: V,
                    interval: "month",
                },
            },
        });
        await prisma.subscription.update({
            where: { id: sub.id },
            data: { planId: free.id },
        });
        // Nothing is taken away; adding is refused.
        expect(await countUsage(prisma, orgId, "products")).toBe(5);
        expect(await refusal(add(orgId, "products"))).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limit: 3,
            used: 5,
        });
    });

    it("reads a grandfathered business as Free once its date has passed", async () => {
        const { orgId } = await business("free");
        for (let i = 0; i < 4; i++) await product(orgId);
        const override = await prisma.entitlementOverride.create({
            data: {
                organizationId: orgId,
                kind: "plan",
                key: "plan",
                planKey: "grow",
                reason: "grandfathered",
                grantedByUserId: "staff",
                expiresAt: new Date(Date.now() + 60 * MINUTE),
            },
        });
        await expect(add(orgId, "products")).resolves.toMatchObject({
            limit: 5,
        });
        await prisma.entitlementOverride.update({
            where: { id: override.id },
            data: { expiresAt: new Date(Date.now() - MINUTE) },
        });
        expect(await refusal(add(orgId, "products"))).toMatchObject({
            limit: 3,
            used: 4,
        });
    });

    it("never refuses a soft cap, and tells the business once it is past", async () => {
        const { orgId, storeId } = await business("free");
        await order(orgId, storeId);
        await order(orgId, storeId);
        await expect(
            prisma.$transaction((tx) =>
                meter.roomInTx(tx, orgId, "orders", { soft: true }),
            ),
        ).resolves.toMatchObject({ limit: 2, used: 2 });
        const jobs = await prisma.job.count({
            where: { organizationId: orgId, type: PLAN_LIMIT_NOTICE_TYPE },
        });
        expect(jobs).toBe(1);
    });

    it("never refuses a row the catalogue marks soft, though the caller doesn't say so", async () => {
        const { orgId } = await business("free");
        // Plan A's storage is 1 GB, soft; 1.5 GB is already in.
        await media(orgId, 1_500_000_000, "READY");
        await expect(
            prisma.$transaction((tx) =>
                meter.roomInTx(tx, orgId, "storage", { adding: 0.1 }),
            ),
        ).resolves.toMatchObject({ key: "storageGb", limit: 1, used: 1.5 });
        // Visits, soft and monthly: past the cap, counted and told.
        await views(orgId, monthFirstDay(new Date(), "Asia/Kolkata"), 10);
        await expect(
            prisma.$transaction((tx) =>
                meter.roomInTx(tx, orgId, "visits", { adding: 5 }),
            ),
        ).resolves.toMatchObject({ key: "visitsPerMonth", used: 10 });
        expect(
            await prisma.job.count({
                where: { organizationId: orgId, type: PLAN_LIMIT_NOTICE_TYPE },
            }),
        ).toBe(1);
    });

    it("lets the write through when the plan can't be read (fail safe)", async () => {
        const { orgId } = await business("free");
        for (let i = 0; i < 4; i++) await product(orgId);
        const broken = new MeteringService(
            {
                resolve: () => Promise.reject(new Error("down")),
            } as unknown as CatalogueAccessService,
            flags,
        );
        await expect(
            prisma.$transaction((tx) => broken.roomInTx(tx, orgId, "products")),
        ).resolves.toBeNull();
    });

    it("lets one of two racing writes take the last place", async () => {
        const { orgId } = await business("free");
        await product(orgId);
        await product(orgId);
        const held = gate();
        const pid = gate<number>();
        const first = prisma.$transaction(async (tx) => {
            await meter.roomInTx(tx, orgId, "products");
            pid.release(await backendPid(tx));
            await held.wait;
            await product(orgId, "PUBLISHED", tx);
        });
        const holder = await pid.wait;
        const second = prisma
            .$transaction(async (tx) => {
                await meter.roomInTx(tx, orgId, "products");
                await product(orgId, "PUBLISHED", tx);
            })
            .then(
                () => null,
                (err: unknown) => err,
            );
        await waitUntilAdvisoryBlockedBy(holder);
        held.release();
        await first;
        expect(detailsOf(await second)).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            used: 3,
        });
        expect(await countUsage(prisma, orgId, "products")).toBe(3);
    });
});

describe("limit notices (DB, U13)", () => {
    const run = async (orgId: string) => {
        const jobs = await prisma.job.findMany({
            where: { organizationId: orgId, type: PLAN_LIMIT_NOTICE_TYPE },
        });
        for (const job of jobs) await handler.handle(job);
        return jobs.length;
    };
    const notices = (orgId: string) =>
        prisma.notification.findMany({
            where: {
                organizationId: orgId,
                type: PLAN_LIMIT_NOTIFICATION_TYPE,
            },
            orderBy: { createdAt: "asc" },
            select: { title: true, body: true },
        });

    it("warns from 80% and again at the cap, once each", async () => {
        const { orgId } = await business("grow");
        // 5 is the cap: 4 is 80%.
        for (let i = 0; i < 3; i++) {
            await add(orgId, "products");
            await product(orgId);
        }
        expect(await run(orgId)).toBe(0);
        await add(orgId, "products");
        await product(orgId);
        expect(await run(orgId)).toBe(1);
        await add(orgId, "products");
        await product(orgId);
        // Both jobs run again: a redelivery tells nobody twice.
        expect(await run(orgId)).toBe(2);
        expect(await notices(orgId)).toEqual([
            {
                title: "You've used 4 of 5 products on Plan B",
                body: "You'll be stopped at 5. Plan C gives you more.",
            },
            {
                title: "You've reached your 5 products on Plan B",
                body: "You can't add more products. Plan C raises the limit, or add more with an add-on.",
            },
        ]);
    });

    it("says nothing when the switch went off before the job ran", async () => {
        const { orgId } = await business("free");
        await product(orgId);
        await product(orgId);
        await add(orgId, "products"); // to 3 of 3
        await prisma.featureFlagOverride.updateMany({
            where: { organizationId: orgId, flagKey: FlagKey.PLAN_ENFORCEMENT },
            data: { enabled: false },
        });
        expect(await run(orgId)).toBe(1);
        expect(await notices(orgId)).toEqual([]);
    });

    it("names the month in a monthly notice, so next month warns again", async () => {
        const { orgId, storeId } = await business("free", {
            zone: "Asia/Kolkata",
        });
        await order(orgId, storeId);
        await prisma.$transaction((tx) => meter.roomInTx(tx, orgId, "orders"));
        await order(orgId, storeId);
        await run(orgId);
        const claim = await prisma.customerNotice.findFirstOrThrow({
            where: { organizationId: orgId, kind: "PLAN_LIMIT" },
        });
        const month = DateTime.now()
            .setZone("Asia/Kolkata")
            .toFormat("yyyy-MM");
        expect(claim.eventKey).toBe(`plan-limit:orders:full:2:${month}`);
    });
});

describe("usage on GET …/billing/access (DB, U13)", () => {
    it("shows each metered row's count, whether or not the switch is on", async () => {
        const { orgId, storeId } = await business("free", { enforce: false });
        await product(orgId);
        await product(orgId);
        await order(orgId, storeId);
        const view = await access.view(owner(orgId));
        const row = (id: string) => view.modules.find((m) => m.moduleId === id);
        expect(row("products")).toMatchObject({ limit: 3, usage: 2 });
        expect(row("orders")).toMatchObject({ limit: 2, usage: 1 });
        // A switch isn't counted; a row the plan leaves off shows no usage.
        expect(row("review")?.usage).toBeNull();
        expect(row("roles")?.usage).toBeNull();
    });
});
