import { describe, expect, it } from "vitest";

import {
    dateRangeAsk,
    dateRangeOn,
    dateRangeWords,
    NO_DATE_RANGE,
    readDateRange,
    writeDateRange,
} from "./date-range";

/**
 * A list's date filter in the address (Orders' `?date=`, `?from=`,
 * `?to=`), shared by Invoices, All bookings and the stock log.
 */
describe("the date filter's address", () => {
    it("reads a preset, and a custom range's days", () => {
        expect(readDateRange({ date: "7d" })).toEqual({
            date: "7d",
            from: null,
            to: null,
        });
        expect(
            readDateRange({
                date: "custom",
                from: "2026-08-01",
                to: "2026-10-31",
            }),
        ).toEqual({ date: "custom", from: "2026-08-01", to: "2026-10-31" });
    });

    it("drops what is malformed, and days outside a custom range", () => {
        expect(readDateRange({ date: "decade" })).toEqual(NO_DATE_RANGE);
        expect(
            readDateRange({ date: "custom", from: "2026-02-30", to: "x" }),
        ).toEqual({ date: "custom", from: null, to: null });
        expect(readDateRange({ date: "today", from: "2026-08-01" }).from).toBe(
            null,
        );
    });

    it("writes over what was there, keeping every other part", () => {
        const q = new URLSearchParams("tab=paid&date=7d");
        writeDateRange(
            { date: "custom", from: "2026-08-01", to: "2026-10-31" },
            q,
        );
        expect(q.toString()).toBe(
            "tab=paid&date=custom&from=2026-08-01&to=2026-10-31",
        );
        writeDateRange(NO_DATE_RANGE, q);
        expect(q.toString()).toBe("tab=paid");
    });

    it("narrows only once a custom range has a day", () => {
        expect(dateRangeOn({ date: "custom", from: null, to: null })).toBe(
            false,
        );
        expect(
            dateRangeOn({ date: "custom", from: "2026-08-01", to: null }),
        ).toBe(true);
        expect(dateRangeOn({ date: "month", from: null, to: null })).toBe(true);
    });

    it("asks the API for the days the right way round", () => {
        expect(
            dateRangeAsk({
                date: "custom",
                from: "2026-10-31",
                to: "2026-08-01",
            }),
        ).toEqual({ date: undefined, from: "2026-08-01", to: "2026-10-31" });
        expect(dateRangeAsk({ date: "today", from: null, to: null })).toEqual({
            date: "today",
            from: undefined,
            to: undefined,
        });
    });

    it("says the range at the end of a sentence", () => {
        expect(dateRangeWords({ date: "7d", from: null, to: null })).toBe(
            "in the last 7 days",
        );
        expect(
            dateRangeWords({
                date: "custom",
                from: "2026-08-01",
                to: "2026-08-01",
            }),
        ).toBe("on 1 Aug");
        expect(
            dateRangeWords({ date: "custom", from: "2026-08-01", to: null }),
        ).toBe("since 1 Aug");
        expect(dateRangeWords(NO_DATE_RANGE)).toBeNull();
    });
});
