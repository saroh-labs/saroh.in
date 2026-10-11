// DB-free: the raw reads are mocked; Prisma.sql stays real so the query's
// text and values can be checked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return { ...actual, prisma: { $queryRaw: jest.fn() } };
});

import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { AdminUsageService } from "./admin-usage.service";

/**
 * The storage view across businesses (#798): one page of businesses sorted
 * by READY media bytes, read in GB as the plan's `storageGb` counts them.
 */
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

function sqlOf(call: number): Prisma.Sql {
    return queryRaw.mock.calls[call][0] as Prisma.Sql;
}

function answer(rows: unknown[], total = 3, bytes: bigint = 0n) {
    queryRaw
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ total: BigInt(total), bytes }]);
}

describe("AdminUsageService.storage", () => {
    beforeEach(() => jest.resetAllMocks());

    it("lists the most storage first by default, in GB, with the totals", async () => {
        answer(
            [
                {
                    id: "org_a",
                    name: "Rye",
                    slug: "rye",
                    lifecycleStatus: "ACTIVE",
                    files: 12n,
                    bytes: 2_345_000_000n,
                },
                {
                    id: "org_b",
                    name: "Pulse",
                    slug: "pulse",
                    lifecycleStatus: "ACTIVE",
                    files: 1n,
                    bytes: 1_000n,
                },
                {
                    id: "org_c",
                    name: "Kettle",
                    slug: "kettle",
                    lifecycleStatus: "SUSPENDED",
                    files: 0n,
                    bytes: 0n,
                },
            ],
            3,
            2_345_001_000n,
        );

        const page = await new AdminUsageService().storage({});

        expect(page).toMatchObject({
            order: "most",
            page: 1,
            limit: 25,
            total: 3,
            totalBytes: 2_345_001_000,
            totalGb: 2.35,
        });
        expect(page.items).toEqual([
            {
                id: "org_a",
                name: "Rye",
                slug: "rye",
                lifecycleStatus: "ACTIVE",
                files: 12,
                bytes: 2_345_000_000,
                gb: 2.35,
            },
            // Anything stored never reads as 0 GB.
            expect.objectContaining({ id: "org_b", bytes: 1_000, gb: 0.01 }),
            expect.objectContaining({ id: "org_c", files: 0, gb: 0 }),
        ]);

        const sql = sqlOf(0);
        expect(sql.sql).toContain('ORDER BY "bytes" DESC');
        expect(sql.sql).toContain('LEFT JOIN "Media"');
        // Only stored media counts, as the plan meter reads it.
        expect(sql.values).toEqual(["READY", 25, 0]);
    });

    it("sorts least first and pages by offset", async () => {
        answer([], 60);

        const page = await new AdminUsageService().storage({
            order: "least",
            page: 3,
            limit: 20,
        });

        expect(page).toMatchObject({ order: "least", page: 3, total: 60 });
        expect(sqlOf(0).sql).toContain('ORDER BY "bytes" ASC');
        expect(sqlOf(0).values).toEqual(["READY", 20, 40]);
    });

    it("clamps a page size past the cap and a page below 1", async () => {
        answer([]);

        const page = await new AdminUsageService().storage({
            page: 0,
            limit: 500,
        });

        expect(page).toMatchObject({ page: 1, limit: 100 });
        expect(sqlOf(0).values).toEqual(["READY", 100, 0]);
    });
});
