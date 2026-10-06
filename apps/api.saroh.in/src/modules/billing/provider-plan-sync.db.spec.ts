/**
 * The billing-provider plan sync against a real Postgres (pricing catalogue
 * U15, OQ-5): a published version's PENDING provider plans become SYNCED or
 * FAILED, a version held for them goes live when the last one is SYNCED (and
 * saroh.in is told), a lost answer is found rather than made twice, and the
 * console can ask again for the FAILED ones. Through the fake provider; no
 * Razorpay call is made.
 *
 * Every catalogue here is made up (`fakeCatalog`). Runs in the integration
 * project (TEST_DATABASE_URL).
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

import {
    liveCatalogueVersion,
    prisma,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows, withGstPaise } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { PRICING_REVALIDATE_TYPE } from "../pricing/revalidate-site.job";
import {
    enqueueProviderPlanSync,
    MAX_SYNC_ATTEMPTS,
    PROVIDER_PLAN_SYNC_TYPE,
    ProviderPlanSyncService,
    retryProviderPlanSyncInTx,
} from "./provider-plan-sync.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const DAY = 24 * 60 * 60 * 1000;

let fake: FakeBillingProvider;
let sync: ProviderPlanSyncService;

beforeEach(async () => {
    fake = new FakeBillingProvider();
    sync = new ProviderPlanSyncService(new FakeBillingProviderFactory(fake));
    await prisma.job.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
});

/** A version as a publish writes it: PENDING provider plans for paid rows. */
async function publish(
    version: number,
    catalog: Catalog = fakeCatalog(),
    goLiveAt = new Date(Date.now() - 1000),
) {
    const rows = planRows(catalog, version);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        planRows: rows,
    });
    const paid = planIds.filter((_, i) => rows[i]!.priceCents > 0);
    await prisma.pricingProviderPlan.createMany({
        data: paid.map((planId) => ({
            planId,
            provider: "RAZORPAY",
            status: "PENDING",
        })),
    });
    return paid.length;
}

/** Version 1, live, with nothing to sync. */
async function liveV1() {
    await publish(1, fakeCatalog(), new Date(Date.now() - DAY));
    await prisma.pricingProviderPlan.updateMany({
        data: { status: "SYNCED" },
    });
    await prisma.pricingProviderPlan.findMany().then((rows) =>
        Promise.all(
            rows.map((r) =>
                prisma.pricingProviderPlan.update({
                    where: { id: r.id },
                    data: { providerPlanId: `pre_${r.id}` },
                }),
            ),
        ),
    );
}

async function rowsOf(version: number) {
    return prisma.pricingProviderPlan.findMany({
        where: { plan: { version } },
        include: { plan: true },
        orderBy: { createdAt: "asc" },
    });
}

async function jobsOf(type: string) {
    return prisma.job.findMany({ where: { type }, orderBy: { runAt: "asc" } });
}

describe("syncing a version's provider plans", () => {
    it("makes each paid plan × cycle at the provider with GST included, and the held version goes live", async () => {
        await liveV1();
        const paid = await publish(2);
        expect(paid).toBe(4); // Plan B and C, monthly and yearly
        expect((await liveCatalogueVersion(prisma))?.version).toBe(1);

        const out = await sync.syncVersion(2, new Date());
        expect(out).toEqual({
            synced: 4,
            failed: 0,
            pending: 0,
            wentLive: true,
        });

        const rows = await rowsOf(2);
        expect(rows.map((r) => r.status)).toEqual(Array(4).fill("SYNCED"));
        for (const r of rows) {
            expect(r.providerPlanId).toBe(`fake_plan_${r.id}`);
            expect(r.syncedAt).not.toBeNull();
        }
        expect(
            fake.plans.created.map((c) => [c.amountPaise, c.period]).sort(),
        ).toEqual(
            rows
                .map((r) => [withGstPaise(r.plan.priceCents), r.plan.interval])
                .sort(),
        );
        expect((await liveCatalogueVersion(prisma))?.version).toBe(2);
        const reval = await jobsOf(PRICING_REVALIDATE_TYPE);
        expect(reval.map((j) => j.payload)).toEqual([
            { version: 2, cause: "go-live" },
        ]);
    });

    it("a scheduled version isn't told to saroh.in by the sync: its go-live refresh is already queued", async () => {
        await liveV1();
        await publish(2, fakeCatalog(), new Date(Date.now() + DAY));
        const out = await sync.syncVersion(2, new Date());
        expect(out).toMatchObject({ synced: 4, wentLive: false });
        expect(await jobsOf(PRICING_REVALIDATE_TYPE)).toHaveLength(0);
        expect((await liveCatalogueVersion(prisma))?.version).toBe(1);
    });

    it("an unanswered create is found next time, never made twice; the job queues its own retry", async () => {
        await liveV1();
        await publish(2);
        fake.plans.failNext("UNKNOWN_MADE", "UNKNOWN");
        await enqueueProviderPlanSync(prisma, 2, new Date());
        const [job] = await jobsOf(PROVIDER_PLAN_SYNC_TYPE);
        await prisma.job.update({
            where: { id: job!.id },
            data: { status: "PROCESSING" },
        });
        await sync.handle(job!);

        const first = await rowsOf(2);
        expect(first.filter((r) => r.status === "SYNCED")).toHaveLength(2);
        const waiting = first.filter((r) => r.status === "PENDING");
        expect(waiting).toHaveLength(2);
        for (const r of waiting) {
            expect(r.attempts).toBe(1);
            expect(r.lastError).toMatch(/network error/);
        }
        // Held while any is PENDING; a later run is queued.
        expect((await liveCatalogueVersion(prisma))?.version).toBe(1);
        const next = (await jobsOf(PROVIDER_PLAN_SYNC_TYPE)).filter(
            (j) => j.status === "PENDING",
        );
        expect(next).toHaveLength(1);
        expect(next[0]!.runAt.getTime()).toBeGreaterThan(Date.now());

        const made = fake.plans.created.length;
        await sync.syncVersion(2, new Date());
        // The one made before its answer was lost is found, not made again.
        expect(fake.plans.created.length).toBe(made + 1);
        expect((await rowsOf(2)).every((r) => r.status === "SYNCED")).toBe(
            true,
        );
        expect((await liveCatalogueVersion(prisma))?.version).toBe(2);
    });

    it("a refusal is FAILED at once; unanswered calls give up after the limit; the console asks again", async () => {
        await liveV1();
        await publish(2);
        fake.plans.failNext("REFUSED");
        await sync.syncVersion(2, new Date());
        let rows = await rowsOf(2);
        const failed = rows.filter((r) => r.status === "FAILED");
        expect(failed).toHaveLength(1);
        expect(failed[0]!.lastError).toMatch(/HTTP 400/);
        expect((await liveCatalogueVersion(prisma))?.version).toBe(1);

        // Another row that never gets an answer.
        await prisma.pricingProviderPlan.update({
            where: { id: rows.find((r) => r.status === "SYNCED")!.id },
            data: {
                status: "PENDING",
                providerPlanId: null,
                attempts: MAX_SYNC_ATTEMPTS - 1,
            },
        });
        // A provider that has no plan for it and doesn't answer.
        const silent = new FakeBillingProvider();
        silent.plans.failNext("UNKNOWN");
        await new ProviderPlanSyncService(
            new FakeBillingProviderFactory(silent),
        ).syncVersion(2, new Date());
        rows = await rowsOf(2);
        expect(rows.filter((r) => r.status === "FAILED")).toHaveLength(2);

        const reset = await prisma.$transaction((tx) =>
            retryProviderPlanSyncInTx(tx, 2, new Date()),
        );
        expect(reset).toBe(2);
        rows = await rowsOf(2);
        expect(rows.filter((r) => r.status === "PENDING")).toHaveLength(2);
        expect(rows.every((r) => r.status !== "FAILED")).toBe(true);
        expect(
            (await jobsOf(PROVIDER_PLAN_SYNC_TYPE)).filter(
                (j) => j.status === "PENDING",
            ),
        ).toHaveLength(1);

        await sync.syncVersion(2, new Date());
        expect((await liveCatalogueVersion(prisma))?.version).toBe(2);
    });

    it("queues one sync per version at a time", async () => {
        await liveV1();
        await publish(2);
        expect(await enqueueProviderPlanSync(prisma, 2, new Date())).toBe(true);
        expect(await enqueueProviderPlanSync(prisma, 2, new Date())).toBe(
            false,
        );
        expect(await jobsOf(PROVIDER_PLAN_SYNC_TYPE)).toHaveLength(1);
    });
});
