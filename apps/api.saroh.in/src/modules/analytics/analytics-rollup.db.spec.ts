/**
 * Insights' hourly rollup chain (DEC-075) against a real Postgres: events
 * received since the last run become one `analytics.aggregate` per business
 * and day, those build the rows the Insights page reads, and the chain
 * keeps one waiting run at a time. Runs in the integration project
 * (TEST_DATABASE_URL), plain and under TEST_RLS=on.
 */
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    ANALYTICS_AGGREGATE_TYPE,
    AnalyticsAggregateHandler,
} from "./analytics-aggregate.handler";
import {
    ANALYTICS_ROLLUP_TYPE,
    AnalyticsRollupHandler,
} from "./analytics-rollup.handler";

const tag = `${process.pid}-${Date.now()}`;
const HOUR = 60 * 60 * 1000;

describe("Insights rollup chain (DB)", () => {
    const rollup = new AnalyticsRollupHandler();
    const aggregate = new AnalyticsAggregateHandler();
    const now = new Date();
    const today = new Date(now.getTime() - 10 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 26 * HOUR);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    let rye = "";
    let kettle = "";

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `rollup-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function view(
        organizationId: string,
        occurredAt: Date,
        receivedAt: Date,
        visitor: string,
    ) {
        await prisma.analyticsEvent.create({
            data: {
                organizationId,
                type: "site.view",
                properties: { path: "/" },
                visitorHash: visitor,
                occurredAt,
                receivedAt,
            },
        });
    }

    beforeAll(async () => {
        rye = await business("Rye");
        kettle = await business("Kettle");
        // Rye: two views today and one that happened yesterday but arrived
        // just now; Kettle: one today. All received in the last hour.
        await view(rye, today, today, "v1");
        await view(rye, today, today, "v2");
        await view(rye, yesterday, today, "v1");
        await view(kettle, today, today, "v9");
        // Received long before the window: already rolled up.
        const old = new Date(now.getTime() - 30 * 24 * HOUR);
        await view(kettle, old, old, "v8");
    });

    it("queues one aggregate per business and day received since the last run", async () => {
        const queued = await rollup.sweep(new Date(now.getTime() - HOUR), now);
        expect(queued).toBe(3);
        const jobs = await prisma.job.findMany({
            where: {
                type: ANALYTICS_AGGREGATE_TYPE,
                organizationId: { in: [rye, kettle] },
            },
            orderBy: { createdAt: "asc" },
        });
        const byKey = (a: unknown, b: unknown) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b));
        expect(jobs.map((j) => j.payload).sort(byKey)).toEqual(
            [
                { organizationId: kettle, date: day(today) },
                { organizationId: rye, date: day(yesterday) },
                { organizationId: rye, date: day(today) },
            ].sort(byKey),
        );

        // Running them writes the rows Insights reads, each business's own.
        for (const job of jobs) await aggregate.handle(job as Job);
        const ryeToday = await prisma.analyticsDailyAggregate.findFirst({
            where: {
                organizationId: rye,
                siteId: "",
                type: "site.view",
                dimension: "",
                date: new Date(`${day(today)}T00:00:00.000Z`),
            },
        });
        expect(ryeToday).toMatchObject({ count: 2, uniqueCount: 2 });
        const kettleToday = await prisma.analyticsDailyAggregate.findFirst({
            where: {
                organizationId: kettle,
                siteId: "",
                type: "site.view",
                dimension: "",
                date: new Date(`${day(today)}T00:00:00.000Z`),
            },
        });
        expect(kettleToday).toMatchObject({ count: 1, uniqueCount: 1 });
    });

    it("keeps one waiting run of the chain, however often it is started", async () => {
        await prisma.job.deleteMany({ where: { type: ANALYTICS_ROLLUP_TYPE } });
        await rollup.ensureScheduled(now);
        await rollup.ensureScheduled(now);
        expect(await rollup.schedule(now, now)).toBe(true);
        const waiting = await prisma.job.findMany({
            where: { type: ANALYTICS_ROLLUP_TYPE, status: "PENDING" },
        });
        expect(waiting).toHaveLength(1);
        expect(waiting[0].payload).toEqual({
            since: rollup.backfillFrom(now).toISOString(),
        });
    });
});
