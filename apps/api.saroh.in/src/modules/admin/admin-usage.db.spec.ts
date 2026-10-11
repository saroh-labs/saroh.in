/**
 * The storage view across businesses (#798) against a real Postgres: the
 * raw read sums READY media per business, lists a business with nothing
 * stored at 0, and sorts across every business. Runs in the integration
 * project (TEST_DATABASE_URL); other specs' businesses share the table, so
 * it asserts about its own rows and the order, never exact totals.
 */
import { prisma } from "@saroh/database";

import { AdminUsageService } from "./admin-usage.service";

const tag = `${process.pid}-${Date.now()}`;
// Media.sizeBytes is an Int: three of these put the business far past any
// other spec's uploads, so it heads "most".
const BIG = 2_000_000_000;

describe("AdminUsageService.storage (DB)", () => {
    const usage = new AdminUsageService();
    let heavy = "";
    let empty = "";

    async function media(
        organizationId: string,
        sizeBytes: number,
        status: string,
        n: number,
    ) {
        await prisma.media.create({
            data: {
                organizationId,
                key: `usage-${tag}-${organizationId}-${n}`,
                contentType: "image/png",
                sizeBytes,
                filename: `${n}.png`,
                status,
            },
        });
    }

    beforeAll(async () => {
        heavy = (
            await prisma.organization.create({
                data: { name: "Heavy", slug: `usage-heavy-${tag}` },
            })
        ).id;
        empty = (
            await prisma.organization.create({
                data: { name: "Empty", slug: `usage-empty-${tag}` },
            })
        ).id;
        await media(heavy, BIG, "READY", 1);
        await media(heavy, BIG, "READY", 2);
        await media(heavy, BIG, "READY", 3);
        // Not stored: a pending upload holds nothing.
        await media(heavy, BIG, "PENDING", 4);
    });

    afterAll(async () => {
        await prisma.organization.deleteMany({
            where: { id: { in: [heavy, empty] } },
        });
    });

    it("puts the business using the most first, counting READY media only", async () => {
        const page = await usage.storage({ order: "most", limit: 5 });

        expect(page.items[0]).toMatchObject({
            id: heavy,
            files: 3,
            bytes: 3 * BIG,
            gb: 6,
        });
        const bytes = page.items.map((row) => row.bytes);
        expect(bytes).toEqual([...bytes].sort((a, b) => b - a));
        expect(page.total).toBeGreaterThanOrEqual(2);
        expect(page.totalBytes).toBeGreaterThanOrEqual(3 * BIG);
    });

    it("lists a business with nothing stored at 0, least first", async () => {
        const page = await usage.storage({ order: "least", limit: 100 });

        const bytes = page.items.map((row) => row.bytes);
        expect(bytes).toEqual([...bytes].sort((a, b) => a - b));
        expect(page.items[0]?.bytes).toBe(0);
        // Every business has a row, so walking the pages finds this one.
        let found = page.items.find((row) => row.id === empty);
        for (let p = 2; !found && p <= Math.ceil(page.total / 100); p++) {
            const next = await usage.storage({
                order: "least",
                page: p,
                limit: 100,
            });
            found = next.items.find((row) => row.id === empty);
        }
        expect(found).toMatchObject({ files: 0, bytes: 0, gb: 0 });
    });
});
