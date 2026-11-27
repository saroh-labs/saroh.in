import { describe, expect, it } from "vitest";

import { leadSubject, nextFollowUps } from "./subject";

describe("leadSubject (DEC-277)", () => {
    it("drops the person's name a form's title starts with", () => {
        expect(leadSubject("Riya Kapoor — Morning yoga", "Riya Kapoor")).toBe(
            "Morning yoga",
        );
        expect(leadSubject("riya kapoor - Trial", "Riya Kapoor")).toBe("Trial");
    });

    it("keeps a title that is about something else, and empties a bare name", () => {
        expect(leadSubject("Monthly membership", "Arjun Mehta")).toBe(
            "Monthly membership",
        );
        expect(leadSubject("Arjun Mehta", "Arjun Mehta")).toBe("");
        expect(leadSubject("Walk-in", null)).toBe("Walk-in");
    });
});

describe("nextFollowUps", () => {
    it("keeps each lead's soonest dated follow-up", () => {
        const next = nextFollowUps([
            { leadId: "a", dueAt: "2026-11-30T04:00:00Z" },
            { leadId: "a", dueAt: "2026-11-28T04:00:00Z" },
            { leadId: "b", dueAt: null },
        ]);
        expect(next.get("a")).toBe("2026-11-28T04:00:00Z");
        expect(next.has("b")).toBe(false);
        expect(nextFollowUps(null).size).toBe(0);
    });
});
