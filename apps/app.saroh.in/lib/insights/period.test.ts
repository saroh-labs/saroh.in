import { describe, expect, it } from "vitest";

import {
    insightsHref,
    periodChoiceLine,
    periodLine,
    periodWindow,
    readAddress,
} from "./period";

/**
 * Insights' one period in the address (DEC-171, #1089): what an address
 * asks for, the address of each tab and period, and the days each period
 * covers, counted as the API counts them (`modules/analytics/period.ts`).
 */
describe("the address", () => {
    it("opens on the Overview for the last 4 weeks", () => {
        expect(readAddress({})).toEqual({
            period: "4w",
            tab: "overview",
            siteId: null,
        });
    });

    it("reads a period, a tab and a website", () => {
        expect(
            readAddress({ period: "7d", tab: "sells", siteId: "site_1" }),
        ).toEqual({ period: "7d", tab: "sells", siteId: "site_1" });
    });

    it("reads anything it doesn't know as the default, never as an error", () => {
        expect(readAddress({ period: "1y", tab: "export" })).toEqual({
            period: "4w",
            tab: "overview",
            siteId: null,
        });
        expect(readAddress({ period: ["3m", "7d"], tab: [] }).period).toBe(
            "3m",
        );
    });

    it("opens an old website link on the website's tab, for the nearest period", () => {
        expect(readAddress({ range: "7d" })).toMatchObject({
            period: "7d",
            tab: "from",
        });
        expect(readAddress({ range: "30d", siteId: "s" })).toEqual({
            period: "4w",
            tab: "from",
            siteId: "s",
        });
        expect(readAddress({ range: "90d" }).period).toBe("3m");
        // A period or a tab of its own wins over the old range.
        expect(
            readAddress({ range: "90d", period: "7d", tab: "money" }),
        ).toMatchObject({ period: "7d", tab: "money" });
    });

    it("says only what differs from the defaults, and keeps the website", () => {
        expect(insightsHref({ tab: "overview", period: "4w" })).toBe(
            "/analytics",
        );
        expect(insightsHref({ tab: "money", period: "4w" })).toBe(
            "/analytics?tab=money",
        );
        expect(insightsHref({ tab: "overview", period: "7d" })).toBe(
            "/analytics?period=7d",
        );
        expect(
            insightsHref({ tab: "from", period: "3m", siteId: "site_1" }),
        ).toBe("/analytics?tab=from&period=3m&siteId=site_1");
    });
});

describe("the days a period covers", () => {
    it("7 days is today and the six before, against the 7 before", () => {
        expect(periodWindow("7d", "2026-10-19")).toEqual({
            days: 7,
            from: "2026-10-13",
            to: "2026-10-19",
            beforeFrom: "2026-10-06",
            beforeTo: "2026-10-12",
        });
    });

    it("4 weeks is 28 days, against the 28 before", () => {
        expect(periodWindow("4w", "2026-10-19")).toEqual({
            days: 28,
            from: "2026-09-22",
            to: "2026-10-19",
            beforeFrom: "2026-08-25",
            beforeTo: "2026-09-21",
        });
    });

    it("3 months runs from the day after this date three months ago", () => {
        const w = periodWindow("3m", "2026-10-19");
        expect(w).toMatchObject({ from: "2026-07-20", to: "2026-10-19" });
        expect(w.days).toBe(92);
        expect(w.beforeTo).toBe("2026-07-19");
        expect(w.beforeFrom).toBe("2026-04-19");
    });

    it("3 months from a month's last day stays inside the month", () => {
        // 31 Oct less 3 months is 31 Jul; 31 May's is 28 Feb.
        expect(periodWindow("3m", "2026-10-31").from).toBe("2026-08-01");
        expect(periodWindow("3m", "2026-05-31").from).toBe("2026-03-01");
    });

    it("crosses a year", () => {
        expect(periodWindow("7d", "2027-01-03")).toMatchObject({
            from: "2026-12-28",
            beforeFrom: "2026-12-21",
            beforeTo: "2026-12-27",
        });
    });

    it("refuses something that isn't a day", () => {
        expect(() => periodWindow("7d", "19 Oct")).toThrow();
    });
});

describe("the period said", () => {
    it("under the title: the days, then what they are set against", () => {
        expect(periodLine("4w", periodWindow("4w", "2026-10-19"))).toBe(
            "22 Sep to 19 Oct, compared with the 4 weeks before",
        );
        expect(periodLine("7d", periodWindow("7d", "2026-10-19"))).toBe(
            "13 to 19 Oct, compared with the 7 days before",
        );
    });

    it("in the phone's sheet: 7 days names both weeks", () => {
        expect(periodChoiceLine("7d", periodWindow("7d", "2026-10-19"))).toBe(
            "13 to 19 Oct, against 6 to 12 Oct",
        );
        expect(periodChoiceLine("4w", periodWindow("4w", "2026-10-19"))).toBe(
            "22 Sep to 19 Oct, against the 4 weeks before",
        );
        expect(periodChoiceLine("3m", periodWindow("3m", "2026-10-19"))).toBe(
            "20 Jul to 19 Oct, against the 3 months before",
        );
    });
});
