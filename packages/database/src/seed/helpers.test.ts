import { describe, expect, it } from "vitest";

import type { Db } from "./helpers";
import { buildAnalyticsRows, syncStorefrontFulfilmentTypes } from "./helpers";

/** A Db whose `$executeRaw` records the statement instead of running it. */
function recordingDb() {
    const calls: { sql: string; values: unknown[] }[] = [];
    const db = {
        $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
            calls.push({ sql: strings.join("?"), values });
            return Promise.resolve(3);
        },
    } as unknown as Db;
    return { db, calls };
}

describe("syncStorefrontFulfilmentTypes (review M-5)", () => {
    it("rewrites only the storefronts of the businesses the seed wrote", async () => {
        const { db, calls } = recordingDb();
        await syncStorefrontFulfilmentTypes(db, ["seed_org_a", "seed_org_b"]);

        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call.sql.replace(/\s+/g, " ")).toContain(
            'WHERE s."storeId" IN ( SELECT st."id" FROM "Store" st WHERE st."organizationId" = ANY(?::text[]) )',
        );
        expect(call.values.at(-1)).toEqual(["seed_org_a", "seed_org_b"]);
    });

    it("touches nothing when it is given no business", async () => {
        const { db, calls } = recordingDb();
        expect(await syncStorefrontFulfilmentTypes(db, [])).toBe(0);
        expect(calls).toHaveLength(0);
    });
});

describe("buildAnalyticsRows: a seeded business has an orders figure (#867)", () => {
    const shape = {
        now: new Date("2026-10-09T06:00:00.000Z"),
        days: 7,
        paths: [{ path: "/", weight: 1 }],
        idFor: (iso: string, key: string) => `agg_${iso}_${key}`,
        trendBase: 80,
        trendSlope: 0,
        weekendFactor: 0.5,
        enquiryRate: 0.01,
        orderRate: 0.01,
    };
    const orders = (rows: ReturnType<typeof buildAnalyticsRows>) =>
        rows
            .filter((r) => r.type === "order.paid" && r.dimension === "")
            .reduce((s, r) => s + r.count, 0);

    it("writes paid orders the way the aggregate job does", () => {
        expect(orders(buildAnalyticsRows(shape))).toBeGreaterThan(0);
    });

    it("counts exactly the paid orders a showcase business seeded, by day", () => {
        const paidOrders = new Map([
            ["2026-10-08", 3],
            ["2026-10-09", 2],
        ]);
        const rows = buildAnalyticsRows({ ...shape, paidOrders });
        expect(orders(rows)).toBe(5);
        expect(
            rows.find(
                (r) =>
                    r.type === "order.paid" && r.id === "agg_2026-10-08_orders",
            )?.count,
        ).toBe(3);
    });
});
