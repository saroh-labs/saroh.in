/**
 * The analytics retention sweep (#799) against a real Postgres: events past
 * their `expiresAt` go, events still in retention and events with no stamp
 * stay, the daily aggregates stay, and the chain keeps one waiting run.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import {
    ANALYTICS_RETENTION_TYPE,
    AnalyticsRetentionHandler,
} from "./analytics-retention.handler";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

describe("Analytics retention sweep (DB)", () => {
    const retention = new AnalyticsRetentionHandler();
    const now = new Date();
    let org = "";

    async function event(expiresAt: Date | null, visitor: string) {
        return (
            await prisma.analyticsEvent.create({
                data: {
                    organizationId: org,
                    type: "site.view",
                    properties: { path: "/" },
                    visitorHash: visitor,
                    occurredAt: new Date(now.getTime() - 401 * DAY),
                    receivedAt: new Date(now.getTime() - 401 * DAY),
                    expiresAt,
                },
            })
        ).id;
    }

    beforeAll(async () => {
        org = (
            await prisma.organization.create({
                data: { name: "Retention", slug: `retention-${tag}` },
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.job.deleteMany({
            where: { type: ANALYTICS_RETENTION_TYPE },
        });
        await prisma.organization.delete({ where: { id: org } });
    });

    it("deletes only events past retention and never an aggregate", async () => {
        const expired = await event(new Date(now.getTime() - DAY), "v1");
        const kept = await event(new Date(now.getTime() + DAY), "v2");
        const unstamped = await event(null, "v3");
        const aggregate = await prisma.analyticsDailyAggregate.create({
            data: {
                organizationId: org,
                siteId: "",
                date: new Date(now.getTime() - 401 * DAY),
                type: "site.view",
                dimension: "",
                dimensionValue: "",
                count: 3,
                uniqueCount: 3,
            },
        });

        const swept = await retention.sweep(now);

        expect(swept.deleted).toBeGreaterThanOrEqual(1);
        expect(swept.more).toBe(false);
        const left = await prisma.analyticsEvent.findMany({
            where: { organizationId: org },
            select: { id: true },
        });
        expect(left.map((row) => row.id).sort()).toEqual(
            [kept, unstamped].sort(),
        );
        expect(left.map((row) => row.id)).not.toContain(expired);
        await expect(
            prisma.analyticsDailyAggregate.findUnique({
                where: { id: aggregate.id },
            }),
        ).resolves.toMatchObject({ count: 3 });
    });

    it("keeps one waiting run of the chain", async () => {
        await prisma.job.deleteMany({
            where: { type: ANALYTICS_RETENTION_TYPE },
        });
        expect(await retention.schedule(now)).toBe(true);
        expect(await retention.schedule(now)).toBe(true);
        expect(
            await prisma.job.count({
                where: { type: ANALYTICS_RETENTION_TYPE, status: "PENDING" },
            }),
        ).toBe(1);
    });
});
