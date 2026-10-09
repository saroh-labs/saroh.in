import { describe, expect, it } from "vitest";

import type { AnalyticsAggregateRow } from "./summary";
import { summarizeAnalytics } from "./summary";

/** An org-wide, undimensioned daily row, as the aggregate job writes it. */
const total = (
    date: string,
    type: string,
    count: number,
): AnalyticsAggregateRow => ({
    siteId: "",
    date: `${date}T00:00:00.000Z`,
    type,
    dimension: "",
    dimensionValue: "",
    count,
    uniqueCount: 0,
});

describe("Insights' orders figure (#867)", () => {
    it("counts the paid orders a seeded business's rows carry", () => {
        const { summary } = summarizeAnalytics([
            total("2026-10-08", "site.view", 120),
            total("2026-10-08", "order.paid", 3),
            total("2026-10-09", "order.paid", 2),
        ]);
        expect(summary.orders).toBe(5);
    });

    it("reads net: an order refunded in full counts nothing", () => {
        const { summary } = summarizeAnalytics([
            total("2026-10-08", "order.paid", 3),
            total("2026-10-08", "order.refunded", 1),
        ]);
        expect(summary.orders).toBe(2);
    });

    it("never reads below zero", () => {
        const { summary } = summarizeAnalytics([
            total("2026-10-08", "order.refunded", 2),
        ]);
        expect(summary.orders).toBe(0);
    });

    it("ignores per-site rows, so nothing is counted twice", () => {
        const { summary } = summarizeAnalytics([
            total("2026-10-08", "order.paid", 3),
            { ...total("2026-10-08", "order.paid", 3), siteId: "site_1" },
        ]);
        expect(summary.orders).toBe(3);
    });
});
