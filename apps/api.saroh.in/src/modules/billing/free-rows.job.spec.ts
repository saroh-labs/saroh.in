jest.mock("@saroh/database", () => ({
    prisma: {},
    liveCatalogueVersion: jest.fn(),
    startMissingFreeRows: jest.fn(),
}));
jest.mock("./catalogue-access.service", () => ({ FREE_PLAN_ID: "free" }));

import type { Job, Prisma } from "@saroh/database";
import {
    liveCatalogueVersion as liveFn,
    startMissingFreeRows as startFn,
} from "@saroh/database";

import {
    BILLING_FREE_ROWS_TYPE,
    enqueueFreeRows,
    FreeRowsHandler,
} from "./free-rows.job";

const liveCatalogueVersion = liveFn as unknown as jest.Mock;
const startMissingFreeRows = startFn as unknown as jest.Mock;

const NOW = new Date("2026-10-06T10:00:00.000Z");
const LATER = new Date("2026-10-08T10:00:00.000Z");

function fakeTx(missing: number) {
    const create = jest.fn(async () => ({}));
    const tx = {
        job: { create },
        organization: { count: jest.fn(async () => missing) },
    } as unknown as Prisma.TransactionClient;
    return { tx, create };
}

beforeEach(() => jest.clearAllMocks());

describe("enqueueFreeRows (#839)", () => {
    it("queues at the go-live when a business has no plan row", async () => {
        liveCatalogueVersion.mockResolvedValue({ version: 3 });
        const { tx, create } = fakeTx(2);

        await expect(
            enqueueFreeRows(tx, { version: 4 }, LATER, NOW),
        ).resolves.toBe(true);
        expect(create).toHaveBeenCalledWith({
            data: {
                type: BILLING_FREE_ROWS_TYPE,
                payload: { version: 4 },
                runAt: LATER,
            },
        });
    });

    it("queues while no version is live: every sign-up until then has no row", async () => {
        liveCatalogueVersion.mockResolvedValue(null);
        const { tx, create } = fakeTx(0);

        await expect(
            enqueueFreeRows(tx, { version: 1 }, LATER, NOW),
        ).resolves.toBe(true);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it("queues nothing when a version is live and every business has its row", async () => {
        liveCatalogueVersion.mockResolvedValue({ version: 3 });
        const { tx, create } = fakeTx(0);

        await expect(
            enqueueFreeRows(tx, { version: 4 }, NOW, NOW),
        ).resolves.toBe(false);
        expect(create).not.toHaveBeenCalled();
    });
});

describe("FreeRowsHandler", () => {
    const job = { id: "job-1", payload: { version: 4 } } as unknown as Job;

    it("starts the missing Free rows on the Free plan", async () => {
        startMissingFreeRows.mockResolvedValue({
            organizations: 2,
            started: 1,
            hasSubscription: 0,
            deleted: 0,
            notGrandfathered: 1,
            dryRun: false,
        });

        await new FreeRowsHandler().handle(job);
        expect(startMissingFreeRows).toHaveBeenCalledWith(expect.anything(), {
            planId: "free",
        });
    });

    it("finishes quietly when no live version offers Free", async () => {
        startMissingFreeRows.mockResolvedValue(null);

        await expect(
            new FreeRowsHandler().handle(job),
        ).resolves.toBeUndefined();
    });
});
