import { describe, expect, it } from "vitest";

import {
    formatClock,
    formatClockRange,
    formatDate,
    formatDateTime,
    formatDay,
    formatMonth,
    formatRecent,
    formatRelative,
    formatTime,
    formatTimeRange,
    formatWeekday,
    isTimeZone,
    localDateKey,
    timeZoneName,
    zoneParts,
} from "./datetime";

const IST = "Asia/Kolkata";
// Saturday 10 October 2026, 2:30 pm in India.
const now = new Date("2026-10-10T09:00:00.000Z");

describe("a day", () => {
    it("leaves the year out this year and writes it in any other", () => {
        expect(formatDate("2026-10-12T04:00:00.000Z", IST, { now })).toBe(
            "12 Oct",
        );
        expect(formatDate("2025-10-12T04:00:00.000Z", IST, { now })).toBe(
            "12 Oct 2025",
        );
        expect(formatDate("2027-01-02T04:00:00.000Z", IST, { now })).toBe(
            "2 Jan 2027",
        );
    });

    it("writes the year when asked, and never when told not to", () => {
        const at = "2026-10-12T04:00:00.000Z";
        expect(formatDate(at, IST, { now, year: "always" })).toBe(
            "12 Oct 2026",
        );
        expect(
            formatDate("2025-10-12T04:00:00.000Z", IST, { now, year: "never" }),
        ).toBe("12 Oct");
    });

    it("writes September in three letters, as every other month", () => {
        // ICU's en-GB says "Sept".
        expect(formatDate("2026-09-29T03:18:00.000Z", IST, { now })).toBe(
            "29 Sep",
        );
    });

    it("puts the weekday in front with no comma", () => {
        const at = "2026-10-12T04:00:00.000Z";
        expect(formatDate(at, IST, { now, weekday: "short" })).toBe(
            "Mon 12 Oct",
        );
        expect(
            formatDate(at, IST, { now, weekday: "long", month: "long" }),
        ).toBe("Monday 12 October");
    });

    it("says Today, Tomorrow and Yesterday only when asked", () => {
        const today = "2026-10-10T12:00:00.000Z";
        expect(formatDate(today, IST, { now })).toBe("10 Oct");
        expect(formatDate(today, IST, { now, relative: true })).toBe("Today");
        expect(
            formatDate("2026-10-11T12:00:00.000Z", IST, {
                now,
                relative: true,
            }),
        ).toBe("Tomorrow");
        expect(
            formatDate("2026-10-09T12:00:00.000Z", IST, {
                now,
                relative: "lower",
            }),
        ).toBe("yesterday");
        expect(
            formatDate("2026-10-13T12:00:00.000Z", IST, {
                now,
                relative: true,
                weekday: "short",
            }),
        ).toBe("Tue 13 Oct");
    });

    it("reads the day in the zone given, not the runtime's", () => {
        // 11:30 pm on the 10th in London is 4 am on the 11th in India.
        const at = "2026-10-10T22:30:00.000Z";
        expect(formatDate(at, "Europe/London", { now })).toBe("10 Oct");
        expect(formatDate(at, IST, { now })).toBe("11 Oct");
        expect(formatDate(at, IST, { now, relative: true })).toBe("Tomorrow");
        expect(localDateKey(at, IST)).toBe("2026-10-11");
    });

    it("measures this year in the zone too", () => {
        // 1 January in India, still 31 December in UTC.
        const newYear = new Date("2026-12-31T19:00:00.000Z");
        expect(
            formatDate("2026-12-31T08:00:00.000Z", IST, { now: newYear }),
        ).toBe("31 Dec 2026");
    });
});

describe("a calendar day that is already a key", () => {
    it("reads the same in every zone", () => {
        expect(formatDay("2026-10-12", { today: "2026-10-10" })).toBe("12 Oct");
        expect(formatDay("2025-03-01", { today: "2026-10-10" })).toBe(
            "1 Mar 2025",
        );
        expect(
            formatDay("2026-10-10", { today: "2026-10-10", relative: true }),
        ).toBe("Today");
        expect(
            formatDay("2026-09-18", { today: "2026-10-10", weekday: "short" }),
        ).toBe("Fri 18 Sep");
    });
});

describe("a month and a weekday", () => {
    it("names them", () => {
        const at = "2026-09-29T03:18:00.000Z";
        expect(formatMonth(at, IST)).toBe("September 2026");
        expect(formatMonth(at, IST, { month: "short", year: "never" })).toBe(
            "Sep",
        );
        expect(formatMonth(at, IST, { now, year: "auto" })).toBe("September");
        expect(formatWeekday(at, IST)).toBe("Tuesday");
        expect(formatWeekday(at, IST, "short")).toBe("Tue");
    });
});

describe("a time", () => {
    it("is on the 12-hour clock, lowercase, with no leading zero", () => {
        expect(formatTime("2026-10-10T04:00:00.000Z", IST)).toBe("9:30 am");
        expect(formatTime("2026-10-10T12:35:00.000Z", IST)).toBe("6:05 pm");
    });

    it("writes noon and midnight as 12", () => {
        expect(formatTime("2026-10-10T06:30:00.000Z", IST)).toBe("12:00 pm");
        expect(formatTime("2026-10-10T18:30:00.000Z", IST)).toBe("12:00 am");
        expect(formatTime("2026-10-10T18:45:00.000Z", IST)).toBe("12:15 am");
    });

    it("reads a wall-clock value the same way", () => {
        expect(formatClock("09:30")).toBe("9:30 am");
        expect(formatClock("18:00")).toBe("6:00 pm");
        expect(formatClock("00:00")).toBe("12:00 am");
        expect(formatClock(570)).toBe("9:30 am");
        expect(formatClock(24 * 60)).toBe("12:00 am");
    });
});

describe("a range of time", () => {
    it("says am or pm once when both ends share it", () => {
        expect(
            formatTimeRange(
                "2026-10-10T04:00:00.000Z",
                "2026-10-10T04:45:00.000Z",
                IST,
            ),
        ).toBe("9:30 to 10:15 am");
        expect(formatClockRange("16:30", "17:15")).toBe("4:30 to 5:15 pm");
    });

    it("says both when the range crosses noon", () => {
        expect(
            formatTimeRange(
                "2026-10-10T06:00:00.000Z",
                "2026-10-10T06:45:00.000Z",
                IST,
            ),
        ).toBe("11:30 am to 12:15 pm");
        expect(formatClockRange(690, 735)).toBe("11:30 am to 12:15 pm");
    });
});

describe("a day and its time", () => {
    it("joins them with a comma", () => {
        const at = "2026-10-12T04:00:00.000Z";
        expect(formatDateTime(at, IST, { now })).toBe("12 Oct, 9:30 am");
        expect(formatDateTime(at, IST, { now, weekday: "short" })).toBe(
            "Mon 12 Oct, 9:30 am",
        );
        expect(
            formatDateTime("2026-10-10T04:00:00.000Z", IST, {
                now,
                relative: true,
            }),
        ).toBe("Today, 9:30 am");
        expect(formatDateTime("2025-09-29T03:18:00.000Z", IST, { now })).toBe(
            "29 Sep 2025, 8:48 am",
        );
    });

    it("gives a log line the time only for today", () => {
        expect(formatRecent("2026-10-10T03:44:00.000Z", IST, now)).toBe(
            "Today, 9:14 am",
        );
        expect(formatRecent("2026-10-09T03:44:00.000Z", IST, now)).toBe(
            "Yesterday",
        );
        expect(formatRecent("2026-09-22T03:44:00.000Z", IST, now)).toBe(
            "22 Sep",
        );
        expect(formatRecent("2025-09-22T03:44:00.000Z", IST, now)).toBe(
            "22 Sep 2025",
        );
    });
});

describe("how long ago", () => {
    const ago = (ms: number) =>
        formatRelative(new Date(now.getTime() - ms), now);

    it("counts whole units", () => {
        expect(ago(20_000)).toBe("just now");
        expect(ago(60_000)).toBe("1 minute ago");
        expect(ago(5 * 60_000)).toBe("5 minutes ago");
        expect(ago(60 * 60_000)).toBe("1 hour ago");
        expect(ago(23 * 60 * 60_000)).toBe("23 hours ago");
        expect(ago(25 * 60 * 60_000)).toBe("1 day ago");
        expect(ago(5 * 24 * 60 * 60_000)).toBe("5 days ago");
    });

    it("never says the future", () => {
        expect(formatRelative(new Date(now.getTime() + 60_000), now)).toBe(
            "just now",
        );
    });
});

describe("the zone", () => {
    it("reads the wall clock", () => {
        expect(zoneParts("2026-10-10T18:45:07.000Z", IST)).toEqual({
            year: 2026,
            month: 10,
            day: 11,
            hour: 0,
            minute: 15,
            second: 7,
            weekday: 0,
        });
    });

    it("knows a zone from a made-up one", () => {
        expect(isTimeZone(IST)).toBe(true);
        expect(isTimeZone("Mars/Olympus")).toBe(false);
        expect(isTimeZone("")).toBe(false);
    });

    it("names it", () => {
        expect(timeZoneName(IST, "shortOffset", now)).toBe("GMT+5:30");
    });
});
