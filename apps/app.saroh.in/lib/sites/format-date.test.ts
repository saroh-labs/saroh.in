import { describe, expect, it } from "vitest";

import { exactDate, shortDate } from "./format-date";

/** Site dates in the business's zone (UX-008), never pinned to UTC. */
describe("site dates", () => {
    const evening = "2025-10-06T14:59:00Z"; // 20:29 in Kolkata
    const beforeUtcMidnight = "2025-10-05T20:00:00Z"; // 01:30 on the 6th

    it("writes an evening in India as the business keeps it", () => {
        expect(exactDate(evening, "Asia/Kolkata")).toBe("6 Oct 2025, 20:29");
        expect(shortDate(evening, "Asia/Kolkata")).toBe("6 Oct");
    });

    it("moves a time just before UTC's midnight to the business's day", () => {
        expect(exactDate(beforeUtcMidnight, "Asia/Kolkata")).toBe(
            "6 Oct 2025, 01:30",
        );
        expect(shortDate(beforeUtcMidnight, "Asia/Kolkata")).toBe("6 Oct");
        expect(shortDate(beforeUtcMidnight, "UTC")).toBe("5 Oct");
    });

    it("names no zone: it is the business's own clock", () => {
        expect(exactDate(evening, "Asia/Kolkata")).not.toMatch(/UTC|GMT|IST/);
    });
});
