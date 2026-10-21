import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PRIVATE_PATH_PREFIXES } from "@saroh/block-contract";

import {
    describePrivatePathPurge,
    privatePathCondition,
    purgePrivatePathViews,
} from "./private-path-views";

describe("private-path-views (U15 privacy review)", () => {
    it("matches each private prefix, under it, and with a query after it", () => {
        const sql = privatePathCondition(Prisma.sql`p`);
        for (const prefix of PRIVATE_PATH_PREFIXES) {
            expect(sql.values).toEqual(
                expect.arrayContaining([
                    prefix,
                    `${prefix}/%`,
                    `${prefix}?%`,
                    `${prefix}#%`,
                ]),
            );
        }
        // No LIKE wildcard hides in a prefix, so `/q` never matches `/quotes`.
        for (const prefix of PRIVATE_PATH_PREFIXES) {
            expect(prefix).not.toMatch(/[%_\\]/);
        }
    });

    it("a dry run counts and deletes nothing", async () => {
        const prisma = {
            $queryRaw: vi.fn().mockResolvedValue([{ n: BigInt(3) }]),
            $executeRaw: vi.fn(),
        };
        const report = await purgePrivatePathViews(prisma as never, {
            apply: false,
        });
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(report).toMatchObject({
            events: 3,
            aggregates: 3,
            deletedEvents: 0,
            deletedAggregates: 0,
        });
        expect(describePrivatePathPurge(report, false).join("\n")).toContain(
            "dry run",
        );
    });

    it("applies in batches until a short one", async () => {
        const prisma = {
            $queryRaw: vi.fn().mockResolvedValue([{ n: BigInt(2) }]),
            $executeRaw: vi
                .fn()
                .mockResolvedValueOnce(5000)
                .mockResolvedValueOnce(12)
                .mockResolvedValueOnce(4),
        };
        const report = await purgePrivatePathViews(prisma as never, {
            apply: true,
        });
        expect(report.deletedEvents).toBe(5012);
        expect(report.deletedAggregates).toBe(4);
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    });
});
