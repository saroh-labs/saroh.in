/**
 * One catalogue per edition (stage 9, U2, KTD1/KTD3b) against a real
 * Postgres: each edition's draft, versions and go-live stay its own; the
 * public pricing answers by the address asked; a coupon redeems only in its
 * own edition; and Global's first, Free-only version moves Global
 * businesses off India's Free row.
 *
 * Every catalogue and amount here is made up
 * (`test/fixtures/pricing-catalog.ts`). Runs in the integration project.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import {
    liveCatalogueVersion,
    prisma,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { freeOnlyCatalog, planRows } from "@saroh/pricing-catalog";
import type { Response } from "express";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { AdminAuditService } from "../admin/admin-audit.service";
import { repointFreeRowsInTx } from "../billing/free-rows.job";
import { CatalogueWritesService } from "./catalogue-writes.service";
import { CatalogueService } from "./catalogue.service";
import { findUsableCoupon } from "./coupons.service";
import { installGlobalFreeCatalogue } from "./global-free-catalogue";
import { ImpactService } from "./impact.service";
import { PublicPricingController } from "./public-pricing.controller";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

const writes = new CatalogueWritesService(new AdminAuditService());
const catalogue = new CatalogueService(new ImpactService());
const pricing = new PublicPricingController(catalogue);

/** A made-up catalogue in dollars with no tax. */
const usd = (edit?: (c: Catalog) => void) =>
    fakeCatalog((c) => {
        c.currency = "USD";
        c.tax = "none";
        c.yearly.on = false;
        for (const p of c.plans) delete p.trial;
        edit?.(c);
    });

async function install(
    version: number,
    edition: "INDIA" | "GLOBAL",
    catalog: Catalog,
) {
    await writeCatalogueVersion(prisma, {
        version,
        edition,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

async function wipe() {
    await prisma.job.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingCoupon.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogDraft.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.adminAuditEvent.deleteMany({});
}

let n = 0;
async function business(edition: "INDIA" | "GLOBAL") {
    n += 1;
    return prisma.organization.create({
        data: { name: `Ed ${n}`, slug: `ed-${n}-${tag}`, edition },
    });
}

async function onFree(organizationId: string, version: number) {
    const plan = await prisma.plan.findFirstOrThrow({
        where: { key: "catalog.free", version, interval: "month" },
    });
    return prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            billingCycle: "month",
        },
    });
}

function fakeRes() {
    const res = { setHeader: () => res, status: () => res };
    return res as unknown as Response;
}

describe("one catalogue per edition (DB, stage 9 U2)", () => {
    let staffId: string;

    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: { email: `ed-staff-${tag}@example.com`, name: "Staff" },
            })
        ).id;
    });
    beforeEach(wipe);

    it("publishes Global's draft as its own version and leaves India's live one", async () => {
        await install(1, "INDIA", fakeCatalog());
        const now = new Date();
        const saved = await writes.saveDraft(
            "GLOBAL",
            staffId,
            { catalog: usd() as never, revision: 0, baseVersion: null },
            now,
        );
        // India's draft is untouched: there is none.
        expect(
            await prisma.pricingCatalogDraft.findUnique({
                where: { id: "shared" },
            }),
        ).toBeNull();
        const published = await writes.publish(
            "GLOBAL",
            staffId,
            {
                revision: saved.revision,
                policy: "keep",
                reason: "Global prices",
                idempotencyKey: `k-${tag}-1`,
            },
            now,
        );
        // Versions number across editions: Global's first is 2.
        expect(published.version).toBe(2);
        expect((await liveCatalogueVersion(prisma, "INDIA"))?.version).toBe(1);
        const rows = await prisma.plan.findMany({ where: { version: 2 } });
        expect(new Set(rows.map((r) => r.currency))).toEqual(new Set(["USD"]));
    });

    it("refuses a Global draft in rupees", async () => {
        const now = new Date();
        const saved = await writes.saveDraft(
            "GLOBAL",
            staffId,
            { catalog: fakeCatalog() as never, revision: 0, baseVersion: null },
            now,
        );
        await expect(
            writes.publish(
                "GLOBAL",
                staffId,
                {
                    revision: saved.revision,
                    policy: "keep",
                    reason: "x",
                    idempotencyKey: `k-${tag}-2`,
                },
                now,
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("serves each address its own edition's pricing", async () => {
        await install(1, "INDIA", fakeCatalog());
        await install(2, "GLOBAL", usd());
        const india = await pricing.get(
            "api.saroh.in",
            undefined,
            undefined,
            fakeRes(),
        );
        const global = await pricing.get(
            "api.saroh.tech",
            undefined,
            undefined,
            fakeRes(),
        );
        expect(india?.version).toBe(1);
        expect(india?.catalog.currency).toBe("INR");
        expect(global?.version).toBe(2);
        expect(global?.catalog.currency).toBe("USD");
        expect(global?.catalog.tax).toBe("none");
    });

    it("redeems a coupon only in its own edition", async () => {
        await install(1, "INDIA", fakeCatalog());
        const shop = await business("INDIA");
        await prisma.pricingCoupon.create({
            data: {
                code: `GLB${n}`,
                edition: "GLOBAL",
                discountPaise: 100,
                months: 1,
                planIds: ["b"],
                maxRedemptions: 5,
            },
        });
        await expect(
            findUsableCoupon({
                code: `GLB${n}`,
                organizationId: shop.id,
                edition: "INDIA",
                planId: "b",
                planName: "Plan B",
                now: new Date(),
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("installs Global's Free-only version from India's and moves Global businesses onto it", async () => {
        await install(1, "INDIA", fakeCatalog());
        const india = await business("INDIA");
        const global = await business("GLOBAL");
        await onFree(india.id, 1);
        const sub = await onFree(global.id, 1);

        const made = await installGlobalFreeCatalogue(writes, new Date());
        expect(made?.status).toBe("live");
        const live = await liveCatalogueVersion(prisma, "GLOBAL");
        expect(live?.version).toBe(2);
        expect(live?.catalog).toEqual(
            JSON.parse(
                JSON.stringify(
                    freeOnlyCatalog(fakeCatalog(), {
                        currency: "USD",
                        tax: "none",
                    }),
                ),
            ),
        );
        // Its go-live queued Global's Free rows.
        const job = await prisma.job.findFirst({
            where: { type: "billing.free-rows.start" },
        });
        expect(job?.payload).toMatchObject({ edition: "GLOBAL" });

        const moved = await prisma.$transaction((tx) =>
            repointFreeRowsInTx(tx, "GLOBAL", new Date()),
        );
        expect(moved).toBe(1);
        const after = await prisma.subscription.findUniqueOrThrow({
            where: { id: sub.id },
            include: { plan: true },
        });
        expect(after.plan.version).toBe(2);
        expect(after.plan.currency).toBe("USD");
        // India's business never moves.
        const indian = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: india.id },
            include: { plan: true },
        });
        expect(indian.plan.version).toBe(1);
        // A second run changes nothing.
        expect(await installGlobalFreeCatalogue(writes, new Date())).toBeNull();
    });
});
