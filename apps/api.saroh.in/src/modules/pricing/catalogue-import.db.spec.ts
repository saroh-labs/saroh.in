/**
 * `catalogue:import` against a real Postgres: a downloaded snapshot is
 * published as the next version through the publish's own steps, and on a
 * local database with no billing keys its provider plans are settled so it
 * is live at once (`CatalogueWritesService.importSnapshot`).
 *
 * Every catalogue here is made up (`test/fixtures/pricing-catalog.ts`).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        ...jest.requireActual<typeof import("../../env")>("../../env").env,
        PRICING_SITE_URL: "https://site.example.test",
        PRICING_REVALIDATE_SECRET: "a-revalidate-secret-that-is-long-enough-0",
    },
}));

import {
    liveCatalogueVersion,
    prisma,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { AdminAuditService } from "../admin/admin-audit.service";
import {
    LOCAL_PROVIDER_PLAN_PREFIX,
    PROVIDER_PLAN_SYNC_TYPE,
} from "../billing/provider-plan-sync.service";
import {
    CatalogueWritesService,
    IMPORT_ACTOR,
} from "./catalogue-writes.service";
import { PRICING_REVALIDATE_TYPE } from "./revalidate-site.job";

const DAY = 24 * 60 * 60 * 1000;
const writes = new CatalogueWritesService(new AdminAuditService());

/** The "dev environment's" catalogue: Plan B costs something else. */
const devCatalog = () =>
    fakeCatalog((c) => {
        c.plans[1]!.pricePaise = 23_400;
    });

async function installV1(catalog: Catalog = fakeCatalog()) {
    await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, 1),
    });
}

async function wipe() {
    await prisma.job.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogDraft.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.adminAuditEvent.deleteMany({});
}

const providerRows = (version: number) =>
    prisma.pricingProviderPlan.findMany({
        where: { plan: { version } },
        select: { status: true, providerPlanId: true },
    });

describe("catalogue import (DB)", () => {
    beforeEach(wipe);
    afterAll(wipe);

    it("publishes the file as the next version and, with no billing keys, makes it live at once", async () => {
        await installV1();
        const now = new Date();
        const result = await writes.importSnapshot(
            {
                catalog: devCatalog(),
                note: "Copy of version 7, imported from a catalogue file",
                settleProviderPlans: true,
            },
            now,
        );
        expect(result).toMatchObject({
            version: 2,
            status: "live",
            policy: "keep",
        });
        expect(result.providerPlans).toBeGreaterThan(0);
        expect(result.settledLocally).toBe(result.providerPlans);
        expect(result.changes.length).toBeGreaterThan(0);

        expect((await liveCatalogueVersion(prisma, now))?.version).toBe(2);
        const stored = await prisma.pricingCatalogVersion.findUniqueOrThrow({
            where: { version: 2 },
        });
        expect(stored.catalog).toEqual(devCatalog());
        expect(stored.publishedByUserId).toBeNull();
        expect(stored.note).toBe(
            "Copy of version 7, imported from a catalogue file",
        );
        const rows = await providerRows(2);
        expect(rows.length).toBe(result.providerPlans);
        for (const r of rows) {
            expect(r.status).toBe("SYNCED");
            expect(r.providerPlanId).toMatch(
                new RegExp(`^${LOCAL_PROVIDER_PLAN_PREFIX}`),
            );
        }
        // saroh.in is told now, as for a publish that goes live.
        expect(
            await prisma.job.count({
                where: { type: PRICING_REVALIDATE_TYPE },
            }),
        ).toBe(1);
        const audit = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { action: "pricing.version.import" },
        });
        expect(audit).toMatchObject({
            actorUserId: IMPORT_ACTOR,
            targetId: "2",
            outcome: "SUCCESS",
        });
    });

    it("leaves the provider plans to the sync when billing keys are set, as a publish does", async () => {
        await installV1();
        const now = new Date();
        const result = await writes.importSnapshot(
            { catalog: devCatalog(), note: "", settleProviderPlans: false },
            now,
        );
        expect(result).toMatchObject({ version: 2, status: "waiting" });
        expect(result.settledLocally).toBe(0);
        expect((await liveCatalogueVersion(prisma, now))?.version).toBe(1);
        expect(
            (await providerRows(2)).every((r) => r.status === "PENDING"),
        ).toBe(true);
        expect(
            await prisma.job.count({
                where: { type: PROVIDER_PLAN_SYNC_TYPE },
            }),
        ).toBe(1);
    });

    it("installs the first version on a database with none", async () => {
        const result = await writes.importSnapshot(
            { catalog: devCatalog(), note: "", settleProviderPlans: true },
            new Date(),
        );
        expect(result).toMatchObject({ version: 1, status: "live" });
        expect(result.changes).toEqual([]);
    });

    it("rejects a catalogue that doesn't validate and writes nothing", async () => {
        await installV1();
        const broken = { ...devCatalog(), plans: "not a list" };
        await expect(
            writes.importSnapshot(
                { catalog: broken, note: "", settleProviderPlans: true },
                new Date(),
            ),
        ).rejects.toMatchObject({
            status: 400,
            response: {
                message: "That catalogue doesn't validate.",
                details: {
                    errors: expect.arrayContaining([expect.any(String)]),
                },
            },
        });
        expect(await prisma.pricingCatalogVersion.count()).toBe(1);
    });

    it("changes nothing when the file is the live version already", async () => {
        await installV1(devCatalog());
        await expect(
            writes.importSnapshot(
                { catalog: devCatalog(), note: "", settleProviderPlans: true },
                new Date(),
            ),
        ).rejects.toMatchObject({
            status: 409,
            message: expect.stringContaining("live already"),
        });
        expect(await prisma.pricingCatalogVersion.count()).toBe(1);
    });
});
