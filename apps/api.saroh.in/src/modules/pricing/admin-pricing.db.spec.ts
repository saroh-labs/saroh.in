/**
 * The staff reads of the pricing catalogue against a real Postgres (plans
 * catalogue U3): versions as Live / Scheduled / Earlier with the businesses
 * on and moving to each, the draft with who saved it and what it changes,
 * per-plan business counts after plan overrides, usage lines from real
 * counts, and the impact of the draft worked out from real subscriptions.
 *
 * `pricing:read` on each route is pinned by the admin permission contract
 * (`admin.controller.permissions.spec.ts`), and the guard's refusal by
 * `platform-permission.guard.spec.ts`.
 *
 * Every catalogue here is made up (`test/fixtures/pricing-catalog.ts`).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import type { Prisma } from "@saroh/database";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { CatalogueService, SHARED_DRAFT_ID } from "./catalogue.service";
import { ImpactService } from "./impact.service";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

async function publish(
    version: number,
    goLiveAt: Date,
    catalog: Catalog,
    publishedByUserId: string | null = null,
) {
    return writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        note: `fake v${version}`,
        changes: [`fake change ${version}`],
        publishedByUserId,
        planRows: planRows(catalog, version),
    });
}

async function org(name: string, products = 0) {
    const o = await prisma.organization.create({
        data: { name, slug: `ap-${name.toLowerCase()}-${tag}` },
    });
    if (products) {
        await prisma.product.createMany({
            data: Array.from({ length: products }, (_, i) => ({
                organizationId: o.id,
                name: `Thing ${i}`,
                slug: `thing-${i}`,
                price: 1,
            })),
        });
    }
    return o;
}

async function subscribe(
    organizationId: string,
    key: string,
    version: number,
    pending?: { key: string; version: number },
) {
    const plan = await prisma.plan.findFirstOrThrow({
        where: { key, version, interval: "month" },
    });
    const pendingPlan = pending
        ? await prisma.plan.findFirstOrThrow({
              where: { ...pending, interval: "month" },
          })
        : null;
    return prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            // A pending move is whole or absent (CHECK
            // Subscription_pending_move_whole): plan and date together.
            pendingPlanId: pendingPlan?.id ?? null,
            pendingFrom: pendingPlan ? new Date(Date.now() + 2 * DAY) : null,
        },
    });
}

describe("admin pricing reads (DB, U3)", () => {
    const service = new CatalogueService(new ImpactService());
    const now = new Date();
    let staffId: string;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: {
                    email: `pricing-staff-${tag}@example.com`,
                    name: "Staff One",
                },
            })
        ).id;
        // v1 earlier, v2 live, v3 scheduled for tomorrow.
        await publish(1, new Date(now.getTime() - 3 * DAY), fakeCatalog());
        await publish(2, new Date(now.getTime() - DAY), fakeCatalog(), staffId);
        await publish(
            3,
            new Date(now.getTime() + DAY),
            fakeCatalog((c) => {
                c.plans[1]!.pricePaise = 33_300;
            }),
            staffId,
        );

        // A: no subscription (Plan A). B1: Plan B on v2 with 3 things.
        // B2: Plan B on v1, moving to v3, with 1 thing. G: no subscription
        // but a live plan override onto Plan B (grandfathered). O: Plan B on
        // v2 with its own price.
        ids.a = (await org("Alpha")).id;
        ids.b1 = (await org("Bravo", 3)).id;
        ids.b2 = (await org("Charlie", 1)).id;
        ids.g = (await org("Golf")).id;
        ids.o = (await org("Oscar")).id;
        await subscribe(ids.b1, "catalog.b", 2);
        await subscribe(ids.b2, "catalog.b", 1, {
            key: "catalog.b",
            version: 3,
        });
        await subscribe(ids.o, "catalog.b", 2);
        await prisma.entitlementOverride.createMany({
            data: [
                {
                    organizationId: ids.g,
                    kind: "plan",
                    key: "plan",
                    planKey: "b",
                    reason: "fake grandfathering",
                    grantedByUserId: staffId,
                    expiresAt: new Date(now.getTime() + 30 * DAY),
                },
                {
                    organizationId: ids.o,
                    kind: "price",
                    key: "price",
                    value: 111,
                    reason: "fake own price",
                    grantedByUserId: staffId,
                },
                {
                    // Revoked: changes nothing.
                    organizationId: ids.a,
                    kind: "plan",
                    key: "plan",
                    planKey: "c",
                    reason: "fake, revoked",
                    grantedByUserId: staffId,
                    revokedAt: new Date(now.getTime() - 1000),
                },
            ],
        });
    });

    afterEach(async () => {
        await prisma.pricingCatalogDraft.deleteMany({});
    });

    it("lists versions newest first as Scheduled, Live and Earlier, with who published and who is on each", async () => {
        const r = await service.adminPricing(now);
        expect(r.liveVersion).toBe(2);
        expect(
            r.versions.map((v) => [
                v.version,
                v.status,
                v.businesses,
                v.moving,
            ]),
        ).toEqual([
            [3, "scheduled", 0, 1],
            [2, "live", 2, 0],
            [1, "earlier", 1, 0],
        ]);
        expect(r.versions[1]).toMatchObject({
            note: "fake v2",
            changes: ["fake change 2"],
            publishedBy: {
                userId: staffId,
                name: "Staff One",
                email: `pricing-staff-${tag}@example.com`,
            },
        });
        expect(r.versions[2]!.publishedBy).toBeNull();
        expect(r.draft).toBeNull();
        expect(r.editing).toBe("live");
    });

    it("counts businesses per plan after plan overrides, and who is on an older version", async () => {
        const r = await service.adminPricing(now);
        const mine = (planId: string) =>
            r.plans.find((p) => p.planId === planId);
        // The suite's businesses only: other files' rows are truncated between files.
        expect(mine("free")).toMatchObject({ businesses: 1 });
        expect(mine("b")).toMatchObject({ businesses: 4, olderVersion: 1 });
        expect(mine("c")).toMatchObject({ businesses: 0 });
        expect(r.businesses).toEqual({
            total: 5,
            measured: expect.arrayContaining([
                "products",
                "members",
            ]) as unknown,
        });
    });

    it("gives usage lines from real counts, and none for what isn't counted", async () => {
        const r = await service.adminPricing(now);
        const products = r.usage.b!.find((u) => u.moduleId === "products")!;
        expect(products).toMatchObject({
            businesses: 4,
            using: 2,
            highest: 3,
            values: [3, 1, 0, 0],
            line: "2 of 4 use it · highest 3",
        });
        expect(
            r.usage.b!.find((u) => u.moduleId === "invoicing"),
        ).toMatchObject({
            measured: false,
            line: null,
        });
        expect(r.usage.c!.find((u) => u.moduleId === "products")!.line).toBe(
            "Nobody on Plan C yet",
        );
    });

    it("shows the draft with who saved it, what it changes, and counts against it", async () => {
        const draft = fakeCatalog((c) => {
            const cell = c.modules[0]!.cells.b!;
            if (cell.inc) cell.limit = 2;
        });
        await prisma.pricingCatalogDraft.create({
            data: {
                id: SHARED_DRAFT_ID,
                catalog: draft as unknown as Prisma.InputJsonValue,
                revision: 7,
                baseVersion: 2,
                updatedByUserId: staffId,
            },
        });
        const r = await service.adminPricing(now);
        expect(r.editing).toBe("draft");
        expect(r.draft).toMatchObject({
            revision: 7,
            baseVersion: 2,
            valid: true,
            errors: [],
            updatedBy: { userId: staffId, name: "Staff One" },
        });
        expect(r.draft!.changes.length).toBeGreaterThan(0);
        expect(r.usage.b!.find((u) => u.moduleId === "products")).toMatchObject(
            { over: 1, line: "2 of 4 use it · highest 3 · 1 over the limit" },
        );
    });

    it("shows a draft that doesn't validate as it was saved, with why", async () => {
        const bad = JSON.parse(JSON.stringify(fakeCatalog())) as {
            plans: { featured: boolean }[];
        };
        for (const p of bad.plans) p.featured = true;
        await prisma.pricingCatalogDraft.create({
            data: {
                id: SHARED_DRAFT_ID,
                catalog: bad as unknown as Prisma.InputJsonValue,
                revision: 2,
            },
        });
        const r = await service.adminPricing(now);
        expect(r.editing).toBe("live");
        expect(r.draft).toMatchObject({ valid: false, changes: [] });
        expect(r.draft!.errors).toEqual([
            "plans: Only one plan can be highlighted",
        ]);
        await expect(service.adminImpact(now)).rejects.toMatchObject({
            status: 422,
        });
    });

    it("works out the impact of lowering Plan B's things cap from real businesses", async () => {
        const draft = fakeCatalog((c) => {
            const cell = c.modules[0]!.cells.b!;
            if (cell.inc) cell.limit = 2;
            c.plans[1]!.pricePaise = 33_300;
        });
        await prisma.pricingCatalogDraft.create({
            data: {
                id: SHARED_DRAFT_ID,
                catalog: draft as unknown as Prisma.InputJsonValue,
                revision: 9,
            },
        });
        const r = await service.adminImpact(now);
        expect(r).toMatchObject({ revision: 9, liveVersion: 2 });
        const cap = r.impact.items.find((i) =>
            i.title.startsWith("Things on Plan B"),
        )!;
        expect(cap).toMatchObject({ tone: "danger", label: "Takes away" });
        expect(cap.businesses.map((b) => b.id)).toEqual([ids.b1]);

        const price = r.impact.items.find((i) =>
            i.title.startsWith("Plan B:"),
        )!;
        // B1 and B2 pay; Oscar has its own price; Golf is on Plan B without paying.
        expect(price.businesses.map((b) => b.id).sort()).toEqual(
            [ids.b1, ids.b2].sort(),
        );
        expect(r.impact.revenue).toEqual({
            nowPaise: 22_200 * 2 + 111,
            nextPaise: 33_300 * 2 + 111,
        });
    });

    it("is a 404 to check the impact with no draft", async () => {
        await expect(service.adminImpact(now)).rejects.toMatchObject({
            status: 404,
        });
    });
});
