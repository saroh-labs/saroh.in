import { describe, expect, it } from "vitest";

import type { AnalyticsAggregateRow } from "./summary";
import { everyDay, summarizeAnalytics } from "./summary";

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

/** A row for one website, as the aggregate job writes it beside the total. */
const forSite = (
    siteId: string,
    date: string,
    type: string,
    count: number,
    extra: Partial<AnalyticsAggregateRow> = {},
): AnalyticsAggregateRow => ({
    ...total(date, type, count),
    siteId,
    ...extra,
});

describe("visits every day, empty days drawn too (U14, #1097)", () => {
    it("fills each day of the period nobody visited with no visits", () => {
        const { daily } = summarizeAnalytics(
            [
                { ...total("2026-10-08", "site.view", 12), uniqueCount: 9 },
                { ...total("2026-10-11", "site.view", 4), uniqueCount: 3 },
            ],
            { from: "2026-10-07", to: "2026-10-12" },
        );
        expect(daily.map((d) => [d.date, d.views])).toEqual([
            ["2026-10-07", 0],
            ["2026-10-08", 12],
            ["2026-10-09", 0],
            ["2026-10-10", 0],
            ["2026-10-11", 4],
            ["2026-10-12", 0],
        ]);
        expect(daily[0]).toEqual({ date: "2026-10-07", views: 0, uniques: 0 });
    });

    it("draws a period nobody visited as every one of its days", () => {
        const { daily, summary } = summarizeAnalytics([], {
            from: "2026-10-13",
            to: "2026-10-19",
        });
        expect(daily).toHaveLength(7);
        expect(daily.every((d) => d.views === 0)).toBe(true);
        expect(summary.siteViews).toBe(0);
    });

    it("crosses a month and a year", () => {
        expect(
            everyDay([], "2026-12-30", "2027-01-02").map((d) => d.date),
        ).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    });

    it("leaves the days alone without a period, as before", () => {
        const { daily } = summarizeAnalytics([
            total("2026-10-11", "site.view", 4),
            total("2026-10-08", "site.view", 12),
        ]);
        expect(daily.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-11"]);
    });

    it("never loops on a backwards or broken range", () => {
        const days = [{ date: "2026-10-09", views: 2, uniques: 1 }];
        expect(everyDay(days, "2026-10-12", "2026-10-01")).toEqual(days);
        expect(everyDay(days, "yesterday", "2026-10-01")).toEqual(days);
    });
});

describe("one website chosen (siteId)", () => {
    const rows: AnalyticsAggregateRow[] = [
        { ...total("2026-10-08", "site.view", 30), uniqueCount: 20 },
        forSite("site_a", "2026-10-08", "site.view", 18, { uniqueCount: 11 }),
        forSite("site_b", "2026-10-08", "site.view", 12, { uniqueCount: 9 }),
        total("2026-10-08", "enquiry.submitted", 3),
        forSite("site_a", "2026-10-08", "enquiry.submitted", 2),
        total("2026-10-08", "order.paid", 5),
        total("2026-10-08", "order.refunded", 1),
        {
            ...total("2026-10-08", "site.view", 30),
            dimension: "path",
            dimensionValue: "/",
        },
        forSite("site_a", "2026-10-08", "site.view", 7, {
            dimension: "path",
            dimensionValue: "/menu",
        }),
    ];

    it("reads that website's visits, people, enquiries and pages", () => {
        const view = summarizeAnalytics(rows, { siteId: "site_a" });
        expect(view.summary).toMatchObject({
            siteViews: 18,
            uniqueVisitors: 11,
            enquiries: 2,
        });
        expect(view.topPages).toEqual([{ path: "/menu", views: 7 }]);
        expect(view.daily).toEqual([
            { date: "2026-10-08", views: 18, uniques: 11 },
        ]);
    });

    it("keeps paid orders the whole business's, as they are written", () => {
        expect(
            summarizeAnalytics(rows, { siteId: "site_a" }).summary.orders,
        ).toBe(4);
        expect(summarizeAnalytics(rows).summary.orders).toBe(4);
    });

    it("reads every website together without one", () => {
        const view = summarizeAnalytics(rows, { siteId: null });
        expect(view.summary.siteViews).toBe(30);
        expect(view.summary.enquiries).toBe(3);
        expect(view.topPages).toEqual([{ path: "/", views: 30 }]);
    });
});
