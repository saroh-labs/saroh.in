/**
 * The U15 privacy review's one-off (#1099) against a real Postgres: page
 * views stored under a private page, and their `path` rollup rows, go; a
 * public page's stay; a business on legal hold keeps its rows; a dry run
 * deletes nothing; a second run finds nothing.
 */
import { prisma, purgePrivatePathViews } from "@saroh/database";

const tag = `${process.pid}-${Date.now()}`;

describe("purgePrivatePathViews (DB)", () => {
    let org = "";
    let held = "";

    const view = (organizationId: string, path: string) =>
        prisma.analyticsEvent.create({
            data: {
                organizationId,
                type: "site.view",
                properties: { path },
                occurredAt: new Date(),
                receivedAt: new Date(),
            },
        });
    const pathRow = (organizationId: string, path: string) =>
        prisma.analyticsDailyAggregate.create({
            data: {
                organizationId,
                siteId: "",
                date: new Date("2026-10-01T00:00:00Z"),
                type: "site.view",
                dimension: "path",
                dimensionValue: path,
                count: 1,
                uniqueCount: 1,
            },
        });

    beforeAll(async () => {
        org = (
            await prisma.organization.create({
                data: { name: "Purge", slug: `purge-${tag}` },
            })
        ).id;
        held = (
            await prisma.organization.create({
                data: {
                    name: "Purge held",
                    slug: `purge-held-${tag}`,
                    legalHoldAt: new Date(),
                },
            })
        ).id;
    });

    afterAll(async () => {
        for (const id of [org, held]) {
            await prisma.analyticsEvent.deleteMany({
                where: { organizationId: id },
            });
            await prisma.analyticsDailyAggregate.deleteMany({
                where: { organizationId: id },
            });
            await prisma.organization.delete({ where: { id } });
        }
    });

    it("deletes private-path views and rollup rows only, outside legal hold", async () => {
        for (const path of [
            "/account/orders/x",
            "/pay/secret-token",
            "/checkout",
            "/q/abc",
            "/shop/order/abc?x=1",
        ]) {
            await view(org, path);
            await pathRow(org, path);
        }
        for (const path of ["/", "/quotes", "/shop", "/book", "/payments"]) {
            await view(org, path);
            await pathRow(org, path);
        }
        await view(held, "/account");
        await pathRow(held, "/account");

        const dry = await purgePrivatePathViews(prisma, { apply: false });
        expect(dry).toMatchObject({
            deletedEvents: 0,
            deletedAggregates: 0,
        });
        expect(dry.events).toBeGreaterThanOrEqual(5);
        expect(dry.heldEvents).toBeGreaterThanOrEqual(1);
        expect(
            await prisma.analyticsEvent.count({
                where: { organizationId: org },
            }),
        ).toBe(10);

        const done = await purgePrivatePathViews(prisma, { apply: true });
        expect(done.deletedEvents).toBe(done.events);
        expect(done.deletedAggregates).toBe(done.aggregates);

        const left = await prisma.analyticsEvent.findMany({
            where: { organizationId: org },
        });
        expect(
            left.map((e) => (e.properties as { path: string }).path).sort(),
        ).toEqual(["/", "/book", "/payments", "/quotes", "/shop"]);
        const rows = await prisma.analyticsDailyAggregate.findMany({
            where: { organizationId: org },
        });
        expect(rows.map((r) => r.dimensionValue).sort()).toEqual([
            "/",
            "/book",
            "/payments",
            "/quotes",
            "/shop",
        ]);
        // The held business keeps its rows.
        expect(
            await prisma.analyticsEvent.count({
                where: { organizationId: held },
            }),
        ).toBe(1);

        // A second run finds nothing outside the hold.
        const again = await purgePrivatePathViews(prisma, { apply: false });
        expect(again.events).toBe(0);
        expect(again.aggregates).toBe(0);
    });
});
