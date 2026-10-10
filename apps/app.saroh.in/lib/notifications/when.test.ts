import { describe, expect, it } from "vitest";

import { exactWhen, noticeGroup, relativeWhen } from "./when";

const ZONE = "Asia/Kolkata";
// 3:00 pm on 10 Oct 2026 in Kolkata.
const NOW = new Date("2026-10-10T09:30:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HR = 60 * MIN;

describe("how long ago a notification came in", () => {
    it("counts minutes, then hours, while it is today", () => {
        expect(relativeWhen(ago(20_000), NOW, ZONE)).toBe("Just now");
        expect(relativeWhen(ago(5 * MIN), NOW, ZONE)).toBe("5 min ago");
        expect(relativeWhen(ago(59 * MIN), NOW, ZONE)).toBe("59 min ago");
        expect(relativeWhen(ago(2 * HR), NOW, ZONE)).toBe("2 hr ago");
        expect(relativeWhen(ago(14 * HR), NOW, ZONE)).toBe("14 hr ago");
    });

    it("then the day: Yesterday, some days ago, a date", () => {
        expect(relativeWhen(ago(20 * HR), NOW, ZONE)).toBe("Yesterday");
        expect(relativeWhen(ago(3 * 24 * HR), NOW, ZONE)).toBe("3 days ago");
        expect(relativeWhen("2026-09-22T06:00:00.000Z", NOW, ZONE)).toBe(
            "22 Sep",
        );
        expect(relativeWhen("2025-12-30T06:00:00.000Z", NOW, ZONE)).toBe(
            "30 Dec 2025",
        );
    });

    it("minutes still count across midnight", () => {
        const justPast = new Date("2026-10-10T18:40:00.000Z"); // 00:10 on the 11th
        expect(relativeWhen("2026-10-10T18:20:00.000Z", justPast, ZONE)).toBe(
            "20 min ago",
        );
    });

    it("says nothing for a date that isn't one", () => {
        expect(relativeWhen("not a date", NOW, ZONE)).toBe("");
        expect(exactWhen("not a date", ZONE)).toBe("");
    });

    it("the exact moment is on the 12-hour clock", () => {
        expect(exactWhen("2026-10-10T04:00:00.000Z", ZONE)).toMatch(
            /^10 Oct 2026, 9:30\s?am$/i,
        );
    });
});

describe("Today or Earlier", () => {
    it("is the business's day, not the server's", () => {
        // 00:30 on 10 Oct in Kolkata is still 9 Oct in UTC.
        expect(noticeGroup("2026-10-09T19:00:00.000Z", NOW, ZONE)).toBe(
            "today",
        );
        // 11:30 pm on 9 Oct in Kolkata.
        expect(noticeGroup("2026-10-09T18:00:00.000Z", NOW, ZONE)).toBe(
            "earlier",
        );
        expect(noticeGroup(ago(5 * MIN), NOW, ZONE)).toBe("today");
        expect(noticeGroup("2026-09-01T00:00:00.000Z", NOW, ZONE)).toBe(
            "earlier",
        );
    });
});
