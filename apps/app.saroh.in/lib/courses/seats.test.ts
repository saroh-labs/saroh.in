import { describe, expect, it } from "vitest";

import { booksLine, courseTab, runsLine, seatsLeftLine } from "./seats";
import { wallClockToIso } from "./sessions";

const NOW = new Date("2026-10-15T12:00:00Z");
const tuesdays = (starts: string[]) =>
    starts.map((s, i) => ({
        id: `s${i}`,
        startAt: s,
        endAt: new Date(Date.parse(s) + 2 * 3_600_000).toISOString(),
    }));
const service = {
    id: "svc",
    name: "Wheel throwing",
    capacity: 12,
    durationMinutes: 120,
    timezone: "Europe/London",
};

describe("seats", () => {
    it("says how many are left, and Full when none are", () => {
        expect(seatsLeftLine({ seats: 12, enrolled: 9, seatsLeft: 3 })).toBe(
            "3 seats left",
        );
        expect(seatsLeftLine({ seats: 12, enrolled: 11, seatsLeft: 1 })).toBe(
            "1 seat left",
        );
        expect(seatsLeftLine({ seats: 10, enrolled: 10, seatsLeft: 0 })).toBe(
            "Full · 10 of 10",
        );
    });
});

describe("courseTab", () => {
    const base = {
        status: "OPEN" as const,
        sessions: tuesdays(["2026-10-20T17:30:00Z"]),
        sessionsLeft: 1,
        seatsLeft: 2,
    };
    it("puts an open course with seats on Open, and one without on Full", () => {
        expect(courseTab(base)).toBe("OPEN");
        expect(courseTab({ ...base, seatsLeft: 0 })).toBe("FULL");
    });
    it("puts a course whose sessions have all run on Past, whatever its status", () => {
        expect(courseTab({ ...base, sessionsLeft: 0 })).toBe("PAST");
        expect(courseTab({ ...base, status: "CLOSED", sessionsLeft: 0 })).toBe(
            "PAST",
        );
        expect(courseTab({ ...base, status: "ARCHIVED" })).toBe("PAST");
    });
    it("keeps a draft on Draft, even with no sessions", () => {
        expect(
            courseTab({
                ...base,
                status: "DRAFT",
                sessions: [],
                sessionsLeft: 0,
            }),
        ).toBe("DRAFT");
    });
});

describe("runsLine", () => {
    it("names the weekday and time when every session shares them", () => {
        // 18:30 in London (BST) is 17:30 UTC.
        const sessions = tuesdays([
            "2026-10-20T17:30:00Z",
            "2026-10-27T18:30:00Z", // GMT from the 25th: still 18:30 locally
        ]);
        expect(
            runsLine(
                {
                    service,
                    sessions,
                    sessionsLeft: 2,
                    nextSessionAt: sessions[0].startAt,
                },
                NOW,
            ),
        ).toBe("Tuesdays 6:30 pm, from 20 Oct");
    });

    it("says how many sessions remain are coming next once it has started", () => {
        const sessions = tuesdays([
            "2026-10-06T17:30:00Z",
            "2026-10-20T08:00:00Z",
        ]);
        expect(
            runsLine(
                {
                    service,
                    sessions,
                    sessionsLeft: 1,
                    nextSessionAt: sessions[1].startAt,
                },
                NOW,
            ),
        ).toBe("2 sessions, next 20 Oct");
    });

    it("says when it ended", () => {
        const sessions = tuesdays(["2026-10-06T17:30:00Z"]);
        expect(
            runsLine(
                { service, sessions, sessionsLeft: 0, nextSessionAt: null },
                NOW,
            ),
        ).toBe("Ended 6 Oct");
    });
});

describe("booksLine", () => {
    it("says what enrolling books, for a started course too", () => {
        const eight = tuesdays(
            Array.from({ length: 8 }, () => "2026-10-20T17:30:00Z"),
        );
        expect(booksLine({ sessions: eight, sessionsLeft: 8 })).toBe(
            "Books all 8 sessions",
        );
        expect(booksLine({ sessions: eight, sessionsLeft: 6 })).toBe(
            "Books the 6 sessions left of 8",
        );
        expect(booksLine({ sessions: eight, sessionsLeft: 1 })).toBe(
            "Books the last session of 8",
        );
    });
});

describe("wallClockToIso", () => {
    it("reads the day and time on the business's wall, across a clock change", () => {
        // London: BST (UTC+1) in October before the 25th, GMT after.
        expect(wallClockToIso("2026-10-20", "18:30", "Europe/London")).toBe(
            "2026-10-20T17:30:00.000Z",
        );
        expect(wallClockToIso("2026-10-27", "18:30", "Europe/London")).toBe(
            "2026-10-27T18:30:00.000Z",
        );
        expect(wallClockToIso("2026-10-20", "09:00", "Asia/Kolkata")).toBe(
            "2026-10-20T03:30:00.000Z",
        );
    });
});
