import { calendarDay, isOverdue, leadEmail } from "./lead-rules";

describe("lead rules (U20)", () => {
    const today = "2026-10-19";

    it.each([
        ["NEW", "2026-10-18", true],
        ["TRIAL", "2026-10-18", true],
        ["TALKED", "2026-10-19", false],
        ["DEMO", "2026-10-20", false],
        ["WON", "2026-10-01", false],
        ["LOST", "2026-10-01", false],
    ])("a %s lead due %s is overdue: %s", (stage, day, overdue) => {
        expect(isOverdue({ stage, followUpOn: calendarDay(day) }, today)).toBe(
            overdue,
        );
    });

    it("is never overdue with no follow-up", () => {
        expect(isOverdue({ stage: "NEW", followUpOn: null }, today)).toBe(
            false,
        );
    });

    it("merges by the waitlist's email key", () => {
        expect(leadEmail(" A.Sha+site@GoogleMail.com ")).toEqual({
            email: "a.sha+site@googlemail.com",
            key: "asha@gmail.com",
        });
    });
});
