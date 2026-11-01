// DB-free: the raw reads are mocked; Prisma.sql stays real so the query's
// text and values can be checked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return { ...actual, prisma: { $queryRaw: jest.fn() } };
});

import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import { AdminUsageService, storageLimitGb } from "./admin-usage.service";

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

/** A resolver that gives each business the storage row `limits` names. */
function accessWith(limits: Record<string, number | null | "throw">) {
    return {
        resolve: jest.fn(async (organizationId: string) => {
            const limit = limits[organizationId];
            if (limit === "throw") throw new Error("unreadable");
            if (limit === undefined) return { source: "legacy" };
            return {
                source: "catalogue",
                modules: [
                    { moduleId: "products", state: "on", limit: 10 },
                    { moduleId: "storage", state: "on", limit },
                ],
            };
        }),
    } as unknown as CatalogueAccessService;
}

function raw(id: string, bytes: bigint) {
    return {
        id,
        name: id,
        slug: id,
        lifecycleStatus: "ACTIVE",
        files: 1n,
        bytes,
    };
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

        const page = await new AdminUsageService(accessWith({})).storage({});

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
                limitGb: null,
                usedPercent: null,
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

        const page = await new AdminUsageService(accessWith({})).storage({
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

        const page = await new AdminUsageService(accessWith({})).storage({
            page: 0,
            limit: 500,
        });

        expect(page).toMatchObject({ page: 1, limit: 100 });
        expect(sqlOf(0).values).toEqual(["READY", 100, 0]);
    });

    it("gives each row its plan's storage limit and the share used", async () => {
        answer([
            raw("org_half", 2_000_000_000n),
            raw("org_free", 10n),
            raw("org_broken", 10n),
        ]);

        const page = await new AdminUsageService(
            accessWith({ org_half: 4, org_free: null, org_broken: "throw" }),
        ).storage({});

        expect(page.items.map((r) => [r.id, r.limitGb, r.usedPercent])).toEqual(
            [
                ["org_half", 4, 50],
                // No cap on the plan, or a plan that can't be read: no share.
                ["org_free", null, null],
                ["org_broken", null, null],
            ],
        );
    });

    it("sorts closest to the limit across every business, then pages", async () => {
        answer(
            [
                raw("org_big_uncapped", 9_000_000_000n),
                raw("org_mid", 3_000_000_000n),
                raw("org_near", 900_000_000n),
            ],
            3,
        );

        const page = await new AdminUsageService(
            accessWith({ org_mid: 10, org_near: 1 }),
        ).storage({ order: "closest", limit: 2 });

        expect(page.order).toBe("closest");
        expect(page.items.map((r) => r.id)).toEqual(["org_near", "org_mid"]);
        // Read unpaged: the order needs every business's limit.
        expect(sqlOf(0).sql).not.toContain("LIMIT");
        expect(sqlOf(0).values).toEqual(["READY"]);

        answer(
            [
                raw("org_big_uncapped", 9_000_000_000n),
                raw("org_mid", 3_000_000_000n),
                raw("org_near", 900_000_000n),
            ],
            3,
        );
        const second = await new AdminUsageService(
            accessWith({ org_mid: 10, org_near: 1 }),
        ).storage({ order: "closest", limit: 2, page: 2 });
        expect(second.items.map((r) => r.id)).toEqual(["org_big_uncapped"]);
    });
});

describe("storageLimitGb", () => {
    it("reads the storage row's cap only when it is on", () => {
        const on = {
            source: "catalogue",
            modules: [{ moduleId: "storage", state: "on", limit: 4 }],
        };
        const off = {
            source: "catalogue",
            modules: [{ moduleId: "storage", state: "locked", limit: 4 }],
        };
        expect(storageLimitGb(on as never)).toBe(4);
        expect(storageLimitGb(off as never)).toBeNull();
        expect(storageLimitGb({ source: "legacy" } as never)).toBeNull();
    });
});
