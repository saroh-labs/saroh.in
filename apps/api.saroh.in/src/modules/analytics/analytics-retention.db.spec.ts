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
        await prisma.order.deleteMany({ where: { organizationId: org } });
        await prisma.store.deleteMany({ where: { organizationId: org } });
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

    it("clears a visit's source off orders past retention, keeping the order (U15)", async () => {
        const store = await prisma.store.create({
            data: { organizationId: org, name: `Retention ${tag}` },
        });
        const order = (n: string, createdAt: Date, source: string | null) =>
            prisma.order.create({
                data: {
                    storeId: store.id,
                    organizationId: org,
                    orderId: `RET-${n}`,
                    subtotal: "10.00",
                    total: "10.00",
                    createdAt,
                    visitSource: source,
                    visitRef: source ? "diwali-post" : null,
                },
            });
        const old = await order(
            "1",
            new Date(now.getTime() - 401 * DAY),
            "instagram",
        );
        const recent = await order(
            "2",
            new Date(now.getTime() - 30 * DAY),
            "google",
        );
        const none = await order(
            "3",
            new Date(now.getTime() - 500 * DAY),
            null,
        );
        const before = await prisma.order.findUniqueOrThrow({
            where: { id: old.id },
            select: { updatedAt: true },
        });

        const swept = await retention.sweepOrderSources(now);

        expect(swept).toEqual({ cleared: 1, more: false });
        const after = await prisma.order.findMany({
            where: { id: { in: [old.id, recent.id, none.id] } },
            select: {
                id: true,
                visitSource: true,
                visitRef: true,
                total: true,
                updatedAt: true,
            },
        });
        const byId = new Map(after.map((o) => [o.id, o]));
        // The order stays; only where its visit came from goes.
        expect(byId.get(old.id)).toMatchObject({
            visitSource: null,
            visitRef: null,
        });
        expect(byId.get(old.id)?.total.toString()).toBe("10");
        // Clearing it is no change anyone made to the order.
        expect(byId.get(old.id)?.updatedAt.getTime()).toBe(
            before.updatedAt.getTime(),
        );
        expect(byId.get(recent.id)).toMatchObject({
            visitSource: "google",
            visitRef: "diwali-post",
        });
        expect(byId.get(none.id)?.visitSource).toBeNull();
        // A second run finds nothing left to clear.
        expect(await retention.sweepOrderSources(now)).toEqual({
            cleared: 0,
            more: false,
        });
    });

    it("drops a visit's step events past retention like any other event (U15)", async () => {
        const step = await prisma.analyticsEvent.create({
            data: {
                organizationId: org,
                type: "site.visit",
                properties: { source: "instagram", ref: "diwali-post" },
                occurredAt: new Date(now.getTime() - 401 * DAY),
                receivedAt: new Date(now.getTime() - 401 * DAY),
                expiresAt: new Date(now.getTime() - DAY),
            },
        });

        await retention.sweep(now);

        await expect(
            prisma.analyticsEvent.findUnique({ where: { id: step.id } }),
        ).resolves.toBeNull();
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
