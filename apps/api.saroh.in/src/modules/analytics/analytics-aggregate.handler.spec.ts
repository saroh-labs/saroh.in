// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        analyticsEvent: { findMany: jest.fn() },
        analyticsDailyAggregate: { upsert: jest.fn() },
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import {
    ANALYTICS_AGGREGATE_TYPE,
    AnalyticsAggregateHandler,
} from "./analytics-aggregate.handler";

const eventFindMany = prisma.analyticsEvent.findMany as jest.Mock;
const aggregateUpsert = prisma.analyticsDailyAggregate.upsert as jest.Mock;

const DAY = "2026-07-19";
const at = (hhmm: string) => new Date(`2026-07-19T${hhmm}:00Z`);

/** The full event universe across BOTH orgs — findMany filters it by org+day. */
const ALL_EVENTS = [
    // org_1 / site_1 — 3 site.view over 2 paths, 2 distinct visitors.
    view("org_1", "site_1", "/a", "v1", at("09:00")),
    view("org_1", "site_1", "/a", "v2", at("10:00")),
    view("org_1", "site_1", "/b", "v1", at("11:00")),
    // org_2 — a DIFFERENT org's event on the same day. Must NEVER leak into org_1.
    view("org_2", "site_2", "/a", "v9", at("12:00")),
];

function view(
    organizationId: string,
    siteId: string,
    path: string,
    visitorHash: string,
    occurredAt: Date,
) {
    return {
        id: `${organizationId}_${path}_${visitorHash}`,
        organizationId,
        siteId,
        type: "site.view",
        visitorHash,
        occurredAt,
        properties: { path },
    };
}

/** Wire findMany to honor the org + day filter, like the real query. */
function wireFindMany() {
    eventFindMany.mockImplementation((args: { where: Record<string, any> }) => {
        const { organizationId, occurredAt } = args.where;
        return Promise.resolve(
            ALL_EVENTS.filter(
                (e) =>
                    e.organizationId === organizationId &&
                    e.occurredAt >= occurredAt.gte &&
                    e.occurredAt < occurredAt.lt,
            ),
        );
    });
    aggregateUpsert.mockResolvedValue({});
}

/** Find an upsert call by its create tuple (siteId, dimension, dimensionValue). */
function findRow(siteId: string, dimension: string, dimensionValue: string) {
    const call = aggregateUpsert.mock.calls.find((c) => {
        const create = c[0].create;
        return (
            create.siteId === siteId &&
            create.dimension === dimension &&
            create.dimensionValue === dimensionValue
        );
    });
    return call ? call[0].create : undefined;
}

function jobFor(organizationId: string): Job {
    return {
        id: "job_1",
        type: ANALYTICS_AGGREGATE_TYPE,
        payload: { organizationId, date: DAY },
    } as unknown as Job;
}

describe("AnalyticsAggregateHandler — org-isolated daily rollups", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reconciles 3 site.view over 2 paths into correct count + uniqueCount", async () => {
        wireFindMany();
        const handler = new AnalyticsAggregateHandler();

        await handler.handle(jobFor("org_1"));

        // Per-site total: 3 views, 2 distinct visitors {v1, v2}.
        expect(findRow("site_1", "", "")).toMatchObject({
            organizationId: "org_1",
            type: "site.view",
            count: 3,
            uniqueCount: 2,
        });
        // Org-wide total (siteId="") — same numbers (single site).
        expect(findRow("", "", "")).toMatchObject({ count: 3, uniqueCount: 2 });

        // Path /a: 2 views, 2 distinct visitors.
        expect(findRow("site_1", "path", "/a")).toMatchObject({
            count: 2,
            uniqueCount: 2,
        });
        // Path /b: 1 view, 1 distinct visitor.
        expect(findRow("site_1", "path", "/b")).toMatchObject({
            count: 1,
            uniqueCount: 1,
        });
    });

    it("ORG ISOLATION: org_2's same-day event never leaks into org_1's rows", async () => {
        wireFindMany();
        const handler = new AnalyticsAggregateHandler();

        await handler.handle(jobFor("org_1"));

        // Every upsert is stamped org_1 — nothing references org_2.
        for (const call of aggregateUpsert.mock.calls) {
            expect(call[0].create.organizationId).toBe("org_1");
            expect(
                call[0].where[
                    "organizationId_siteId_date_type_dimension_dimensionValue"
                ].organizationId,
            ).toBe("org_1");
        }
        // The org-wide total is 3 (org_1 only), NOT 4 (would include org_2).
        expect(findRow("", "", "")?.count).toBe(3);
        // org_2's /a visitor v9 never inflates org_1's /a uniqueCount.
        expect(findRow("site_1", "path", "/a")?.uniqueCount).toBe(2);
    });

    it("is idempotent: a re-run produces byte-identical upsert values", async () => {
        wireFindMany();
        const handler = new AnalyticsAggregateHandler();

        await handler.handle(jobFor("org_1"));
        const first = aggregateUpsert.mock.calls.map((c) => ({
            where: c[0].where,
            update: c[0].update,
        }));

        aggregateUpsert.mockClear();
        await handler.handle(jobFor("org_1"));
        const second = aggregateUpsert.mock.calls.map((c) => ({
            where: c[0].where,
            update: c[0].update,
        }));

        // Same set of keyed upserts, each setting the SAME absolute values.
        expect(second).toEqual(first);
        // update sets absolute count/uniqueCount (never an increment).
        for (const call of aggregateUpsert.mock.calls) {
            expect(call[0].update).toEqual({
                count: call[0].create.count,
                uniqueCount: call[0].create.uniqueCount,
            });
        }
    });

    it("registers under the analytics.aggregate job type", () => {
        const registry = new JobHandlerRegistry();
        const handler = new AnalyticsAggregateHandler();

        registry.register(ANALYTICS_AGGREGATE_TYPE, handler.handle);

        expect(registry.has("analytics.aggregate")).toBe(true);
        expect(registry.get("analytics.aggregate")).toBe(handler.handle);
    });
});
