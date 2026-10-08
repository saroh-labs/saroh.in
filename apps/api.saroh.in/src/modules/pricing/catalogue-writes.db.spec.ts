/**
 * The catalogue writes against a real Postgres (plans catalogue U4): the
 * shared draft and its revision, publish now or on a date with "keep their
 * terms" or "move them", the billing-provider hold on go-live, cancelling a
 * scheduled version, rolling back, idempotency and the audit row.
 *
 * Every catalogue here is made up (`test/fixtures/pricing-catalog.ts`).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
const mockRevalidate = {
    PRICING_SITE_URL: "https://site.example.test",
    PRICING_REVALIDATE_SECRET: "a-revalidate-secret-that-is-long-enough-0",
};
jest.mock("../../env", () => ({
    env: {
        ...jest.requireActual<typeof import("../../env")>("../../env").env,
        ...mockRevalidate,
    },
}));

// The controller's guard pulls in better-auth (ESM), which Jest can't load;
// these specs call the controller directly, so the guard is a stand-in.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import {
    liveCatalogueVersion,
    prisma,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { addMonthsUtc, planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminPricingController } from "./admin-pricing.controller";
import { CatalogueWritesService } from "./catalogue-writes.service";
import { CatalogueService, SHARED_DRAFT_ID } from "./catalogue.service";
import { CouponsService } from "./coupons.service";
import { ImpactService } from "./impact.service";
import { MoveNoticeHandler } from "./move-notice.handler";
import { PRICING_MOVE_NOTICE_TYPE } from "./moves.service";
import { PRICING_REVALIDATE_TYPE } from "./revalidate-site.job";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

const audit = new AdminAuditService();
const writes = new CatalogueWritesService(audit);
const catalogue = new CatalogueService(new ImpactService());
const controller = new AdminPricingController(
    catalogue,
    writes,
    new CouponsService(audit),
    new IdempotencyService(),
);

let n = 0;
const key = () => `key-${tag}-${++n}`;
const staff = (userId: string) =>
    ({
        userId,
        platformAdminId: "pa",
        roles: [],
        permissions: [],
        viaBootstrap: false,
    }) as never;

/** Plan B costs something else: a made-up change. */
const pricier = () =>
    fakeCatalog((c) => {
        c.plans[1]!.pricePaise = 23_400;
    });
/** Every plan free: nothing for the billing provider to hold. */
const allFree = (edit?: (c: Catalog) => void) =>
    fakeCatalog((c) => {
        for (const p of c.plans) p.pricePaise = 0;
        edit?.(c);
    });

async function installV1(catalog: Catalog = fakeCatalog(), ago = DAY) {
    await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - ago),
        policy: "keep",
        planRows: planRows(catalog, 1),
    });
}

async function wipe() {
    await prisma.notification.deleteMany({});
    await prisma.customerNotice.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogDraft.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.adminAuditEvent.deleteMany({});
    await prisma.idempotencyRecord.deleteMany({});
}

async function syncAll() {
    await prisma.pricingProviderPlan.updateMany({
        data: { status: "SYNCED", syncedAt: new Date() },
    });
}

async function org(name: string) {
    return prisma.organization.create({
        data: { name, slug: `cw-${name.toLowerCase()}-${tag}` },
    });
}

async function subscribe(
    organizationId: string,
    planKey: string,
    version: number,
    interval: "month" | "year",
    currentPeriodEnd: Date | null,
) {
    const plan = await prisma.plan.findFirstOrThrow({
        where: { key: planKey, version, interval },
    });
    return prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            billingCycle: interval,
            currentPeriodEnd,
        },
    });
}

describe("catalogue writes (DB, U4)", () => {
    let ana: string;
    let ben: string;

    beforeAll(async () => {
        ana = (
            await prisma.user.create({
                data: { email: `cw-ana-${tag}@example.com`, name: "Ana" },
            })
        ).id;
        ben = (
            await prisma.user.create({
                data: { email: `cw-ben-${tag}@example.com`, name: "Ben" },
            })
        ).id;
    });

    beforeEach(wipe);

    describe("the shared draft", () => {
        it("starts at revision 1 and goes up on each save, naming the other editor on a stale one", async () => {
            await installV1();
            const first = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            expect(first).toMatchObject({
                revision: 1,
                baseVersion: 1,
                valid: true,
            });
            expect(first.changes.length).toBeGreaterThan(0);

            const second = await controller.saveDraft(staff(ben), {
                catalog: pricier() as never,
                revision: 1,
            });
            expect(second.revision).toBe(2);

            // Ana still holds revision 1.
            await expect(
                controller.saveDraft(staff(ana), {
                    catalog: fakeCatalog() as never,
                    revision: 1,
                }),
            ).rejects.toMatchObject({
                status: 409,
                response: {
                    message: expect.stringContaining("Ben saved the draft"),
                    details: {
                        revision: 2,
                        updatedBy: { userId: ben, name: "Ben" },
                    },
                },
            });
            // A second "new draft" while one exists is stale too.
            await expect(
                controller.saveDraft(staff(ana), {
                    catalog: fakeCatalog() as never,
                    revision: 0,
                }),
            ).rejects.toMatchObject({ status: 409 });

            // Both editors are named on the read (D-2), first save first.
            const read = await catalogue.adminPricing(new Date());
            expect(read.draft?.editors.map((e) => e.name)).toEqual([
                "Ana",
                "Ben",
            ]);
            expect(
                await prisma.adminAuditEvent.count({
                    where: { action: "pricing.draft.save" },
                }),
            ).toBe(2);
        });

        it("keeps a half-edited draft and says why it can't be published", async () => {
            await installV1();
            const twoHighlighted = fakeCatalog();
            twoHighlighted.plans[2]!.featured = true;
            const saved = await controller.saveDraft(staff(ana), {
                catalog: twoHighlighted as never,
                revision: 0,
            });
            expect(saved.valid).toBe(false);
            expect(saved.errors).toContain(
                "plans: Only one plan can be highlighted",
            );

            await expect(
                controller.publish(staff(ana), {
                    revision: saved.revision,
                    policy: "keep",
                    reason: "fake publish",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({
                status: 400,
                response: {
                    details: {
                        errors: expect.arrayContaining([
                            "plans: Only one plan can be highlighted",
                        ]),
                    },
                },
            });
        });

        it("discards only the revision the person saw", async () => {
            await installV1();
            await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            await controller.saveDraft(staff(ben), {
                catalog: pricier() as never,
                revision: 1,
            });
            await expect(
                controller.discardDraft(staff(ana), {
                    revision: 1,
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 409 });
            await controller.discardDraft(staff(ana), {
                revision: 2,
                reason: "fake: starting again",
                idempotencyKey: key(),
            });
            expect(
                await prisma.pricingCatalogDraft.count({
                    where: { id: SHARED_DRAFT_ID },
                }),
            ).toBe(0);
        });
    });

    describe("publish", () => {
        it("publishes now with keep: the next version, its Plan rows, provider plans held PENDING, the draft gone, an audit row", async () => {
            await installV1();
            const d = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            const r = await controller.publish(staff(ana), {
                revision: d.revision,
                policy: "keep",
                note: "fake note",
                reason: "fake publish",
                idempotencyKey: key(),
            });
            expect(r).toMatchObject({
                version: 2,
                status: "waiting",
                policy: "keep",
                moves: { moved: 0, notices: 0 },
                // Plan B and C, monthly and yearly (yearly is on).
                providerPlans: 4,
            });
            expect(r.changes.length).toBeGreaterThan(0);

            const rows = await prisma.plan.findMany({
                where: { key: "catalog.b", version: 2 },
                orderBy: { interval: "asc" },
                select: { interval: true, priceCents: true },
            });
            expect(rows.map((x) => x.interval)).toEqual(["month", "year"]);
            expect(rows[0]!.priceCents).toBe(23_400);
            expect(
                await prisma.pricingProviderPlan.count({
                    where: { status: "PENDING", provider: "RAZORPAY" },
                }),
            ).toBe(4);
            expect(await prisma.pricingCatalogDraft.count()).toBe(0);

            const v = await prisma.pricingCatalogVersion.findUniqueOrThrow({
                where: { version: 2 },
            });
            expect(v).toMatchObject({
                policy: "keep",
                note: "fake note",
                publishedByUserId: ana,
            });
            expect(v.changes).toEqual(r.changes);

            const row = await prisma.adminAuditEvent.findFirstOrThrow({
                where: { action: "pricing.version.publish" },
            });
            expect(row).toMatchObject({
                actorUserId: ana,
                permission: "pricing:publish",
                reason: "fake publish",
                outcome: "SUCCESS",
                targetId: "2",
            });
        });

        it("holds a version with paid plans until the billing provider has them, then serves it", async () => {
            await installV1();
            const d = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            await controller.publish(staff(ana), {
                revision: d.revision,
                policy: "keep",
                reason: "fake publish",
                idempotencyKey: key(),
            });

            expect((await liveCatalogueVersion(prisma))?.version).toBe(1);
            const held = await catalogue.adminPricing(new Date());
            expect(held.liveVersion).toBe(1);
            expect(
                held.versions.map((x) => [x.version, x.status, x.sync]),
            ).toEqual([
                [2, "waiting", { pending: 4, synced: 0, failed: 0 }],
                [1, "live", { pending: 0, synced: 0, failed: 0 }],
            ]);

            await syncAll();
            expect((await liveCatalogueVersion(prisma))?.version).toBe(2);
            expect((await catalogue.adminPricing(new Date())).liveVersion).toBe(
                2,
            );
        });

        it("goes live at once when there's nothing to bill, and queues saroh.in's refresh", async () => {
            await installV1(allFree());
            const d = await controller.saveDraft(staff(ana), {
                catalog: allFree((c) => {
                    c.plans[0]!.tagline = "Fake new line";
                }) as never,
                revision: 0,
            });
            const r = await controller.publish(staff(ana), {
                revision: d.revision,
                policy: "keep",
                reason: "fake publish",
                idempotencyKey: key(),
            });
            expect(r).toMatchObject({
                version: 2,
                status: "live",
                providerPlans: 0,
            });
            expect((await liveCatalogueVersion(prisma))?.version).toBe(2);
            const jobs = await prisma.job.findMany({
                where: { type: PRICING_REVALIDATE_TYPE },
            });
            expect(jobs.map((j) => j.payload)).toEqual([
                { version: 2, cause: "publish" },
            ]);
        });

        it("refuses a draft that changes nothing", async () => {
            await installV1();
            const d = await controller.saveDraft(staff(ana), {
                catalog: fakeCatalog() as never,
                revision: 0,
            });
            await expect(
                controller.publish(staff(ana), {
                    revision: d.revision,
                    policy: "keep",
                    reason: "fake publish",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 409 });
        });

        it("refuses a stale revision, and a reused key with a different body", async () => {
            await installV1();
            await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            await controller.saveDraft(staff(ben), {
                catalog: pricier() as never,
                revision: 1,
            });
            await expect(
                controller.publish(staff(ana), {
                    revision: 1,
                    policy: "keep",
                    reason: "fake publish",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 409 });

            const k = key();
            const first = await controller.publish(staff(ana), {
                revision: 2,
                policy: "keep",
                reason: "fake publish",
                idempotencyKey: k,
            });
            // The same request again is a replay, not a second version.
            await expect(
                controller.publish(staff(ana), {
                    revision: 2,
                    policy: "keep",
                    reason: "fake publish",
                    idempotencyKey: k,
                }),
            ).resolves.toEqual(first);
            await expect(
                controller.publish(staff(ana), {
                    revision: 2,
                    policy: "move",
                    reason: "fake publish",
                    idempotencyKey: k,
                }),
            ).rejects.toMatchObject({ status: 409 });
            expect(await prisma.pricingCatalogVersion.count()).toBe(2);
        });

        it("moves each subscription at its first renewal at least 7 days after go-live, and tells only those whose plan changes", async () => {
            await installV1();
            const now = Date.now();
            const soon = new Date(now + 3 * DAY);
            const later = new Date(now + 20 * DAY);
            const onB = await subscribe(
                (await org("Bravo")).id,
                "catalog.b",
                1,
                "month",
                soon,
            );
            const onC = await subscribe(
                (await org("Charlie")).id,
                "catalog.c",
                1,
                "year",
                later,
            );
            const cancelled = await subscribe(
                (await org("Delta")).id,
                "catalog.b",
                1,
                "month",
                soon,
            );
            await prisma.subscription.update({
                where: { id: cancelled.id },
                data: { status: "CANCELLED" },
            });

            const d = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            const r = await controller.publish(staff(ana), {
                revision: d.revision,
                policy: "move",
                reason: "fake move",
                idempotencyKey: key(),
            });
            expect(r.moves).toEqual({ moved: 2, notices: 1 });

            const b = await prisma.subscription.findUniqueOrThrow({
                where: { id: onB.id },
                include: { pendingPlan: true },
            });
            expect(b.pendingPlan).toMatchObject({
                key: "catalog.b",
                version: 2,
                interval: "month",
            });
            // Renews in 3 days: too soon, so the renewal a month on.
            const nextMonth = addMonthsUtc(soon, 1);
            expect(b.pendingFrom?.getTime()).toBe(nextMonth.getTime());

            const c = await prisma.subscription.findUniqueOrThrow({
                where: { id: onC.id },
                include: { pendingPlan: true },
            });
            expect(c.pendingPlan).toMatchObject({
                key: "catalog.c",
                version: 2,
                interval: "year",
            });
            expect(c.pendingFrom?.getTime()).toBe(later.getTime());

            const untouched = await prisma.subscription.findUniqueOrThrow({
                where: { id: cancelled.id },
            });
            expect(untouched.pendingPlanId).toBeNull();

            // Plan C reads the same on v2: moved, not told.
            const notices = await prisma.job.findMany({
                where: { type: PRICING_MOVE_NOTICE_TYPE },
            });
            expect(notices).toHaveLength(1);
            expect(notices[0]!.payload).toMatchObject({
                subscriptionId: onB.id,
            });
            expect(notices[0]!.runAt.getTime()).toBe(
                nextMonth.getTime() - 7 * DAY,
            );

            // The notice, run twice, tells the business once.
            const handler = new MoveNoticeHandler();
            await handler.handle(notices[0]!);
            await handler.handle(notices[0]!);
            const told = await prisma.notification.findMany({
                where: { organizationId: onB.organizationId },
            });
            expect(told).toHaveLength(1);
            expect(told[0]!.title).toContain("Plan B");
        });

        it("schedules a version: the live one is served until then, nothing else publishes, and cancelling removes it and its moves", async () => {
            await installV1();
            const sub = await subscribe(
                (await org("Echo")).id,
                "catalog.b",
                1,
                "month",
                new Date(Date.now() + 10 * DAY),
            );
            const d = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            const at = new Date(Date.now() + DAY);
            const r = await controller.publish(staff(ana), {
                revision: d.revision,
                goLiveAt: at.toISOString(),
                policy: "move",
                reason: "fake schedule",
                idempotencyKey: key(),
            });
            expect(r).toMatchObject({ version: 2, status: "scheduled" });
            await syncAll();
            expect((await liveCatalogueVersion(prisma))?.version).toBe(1);
            expect(
                await prisma.job.count({
                    where: { type: PRICING_REVALIDATE_TYPE },
                }),
            ).toBe(1);

            // Another publish waits for the scheduled one.
            const d2 = await controller.saveDraft(staff(ana), {
                catalog: fakeCatalog((c) => {
                    c.plans[2]!.pricePaise = 34_500;
                }) as never,
                revision: 0,
            });
            await expect(
                controller.publish(staff(ana), {
                    revision: d2.revision,
                    policy: "keep",
                    reason: "fake publish",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 409 });

            const cancelled = await controller.cancelVersion(staff(ana), 2, {
                reason: "fake: not yet",
                idempotencyKey: key(),
            });
            expect(cancelled).toEqual({ cancelled: 2, movesCleared: 1 });
            expect(
                await prisma.pricingCatalogVersion.count({
                    where: { version: 2 },
                }),
            ).toBe(0);
            expect(await prisma.plan.count({ where: { version: 2 } })).toBe(0);
            expect(await prisma.pricingProviderPlan.count()).toBe(0);
            const after = await prisma.subscription.findUniqueOrThrow({
                where: { id: sub.id },
            });
            expect([after.pendingPlanId, after.pendingFrom]).toEqual([
                null,
                null,
            ]);
            expect(
                await prisma.job.count({
                    where: {
                        type: {
                            in: [
                                PRICING_MOVE_NOTICE_TYPE,
                                PRICING_REVALIDATE_TYPE,
                            ],
                        },
                    },
                }),
            ).toBe(0);
            expect(
                await prisma.adminAuditEvent.count({
                    where: { action: "pricing.version.cancel" },
                }),
            ).toBe(1);
        });

        it("won't cancel a version that has gone live, or schedule one in the past", async () => {
            await installV1();
            await expect(
                controller.cancelVersion(staff(ana), 1, {
                    reason: "fake cancel",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 409 });

            const d = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            await expect(
                controller.publish(staff(ana), {
                    revision: d.revision,
                    goLiveAt: new Date(Date.now() - DAY).toISOString(),
                    policy: "keep",
                    reason: "fake publish",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 400 });
        });
    });

    describe("roll back", () => {
        async function twoVersions() {
            await installV1(fakeCatalog(), 2 * DAY);
            const d = await controller.saveDraft(staff(ana), {
                catalog: pricier() as never,
                revision: 0,
            });
            await controller.publish(staff(ana), {
                revision: d.revision,
                policy: "keep",
                reason: "fake publish",
                idempotencyKey: key(),
            });
            await syncAll();
        }

        it("republishes an earlier snapshot as the next version, policy keep", async () => {
            await twoVersions();
            const r = await controller.rollback(staff(ana), 1, {
                reason: "fake: too soon",
                idempotencyKey: key(),
            });
            expect(r).toMatchObject({ version: 3, policy: "keep" });
            const v3 = await prisma.pricingCatalogVersion.findUniqueOrThrow({
                where: { version: 3 },
            });
            const v1 = await prisma.pricingCatalogVersion.findUniqueOrThrow({
                where: { version: 1 },
            });
            expect(v3.catalog).toEqual(v1.catalog);
            expect(v3.note).toBe("Rolled back to version 1");
            await syncAll();
            expect((await liveCatalogueVersion(prisma))?.version).toBe(3);
            expect(
                await prisma.adminAuditEvent.findFirstOrThrow({
                    where: { action: "pricing.version.rollback" },
                }),
            ).toMatchObject({ reason: "fake: too soon", targetId: "3" });
        });

        it("is refused while a draft exists, and for the pricing that's live", async () => {
            await twoVersions();
            await expect(
                controller.rollback(staff(ana), 2, {
                    reason: "fake roll back",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({ status: 409 });

            await controller.saveDraft(staff(ana), {
                catalog: fakeCatalog() as never,
                revision: 0,
            });
            await expect(
                controller.rollback(staff(ana), 1, {
                    reason: "fake roll back",
                    idempotencyKey: key(),
                }),
            ).rejects.toMatchObject({
                status: 409,
                response: expect.objectContaining({
                    message: expect.stringContaining("draft"),
                }),
            });
        });
    });
});
