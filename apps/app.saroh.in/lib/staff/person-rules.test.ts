import { describe, expect, it } from "vitest";

import {
    askedWords,
    choiceValue,
    ifApproved,
    nowWords,
    personChoices,
    personRuleRows,
    personRuleSaved,
    personSentence,
    requestLine,
    rulesSummary,
    SAME,
    SAME_AS_BUSINESS,
    turnedDownLine,
    waitingLine,
} from "./person-rules";
import type { BookingRules, RuleRequest } from "./types";

const BUSINESS: BookingRules = {
    bookAheadDays: 28,
    latestBookingMinutes: 120,
    freeCancelHours: 24,
    gapMinutes: 0,
};

describe("each person's own booking rules, in words (#1038)", () => {
    it("says a person's own values, their 0s included", () => {
        expect(personSentence("latestBookingMinutes", 720)).toBe(
            "Up to 12 hours before the start",
        );
        expect(personSentence("latestBookingMinutes", 0)).toBe(
            "Up to the start time",
        );
        expect(personSentence("bookAheadDays", 56)).toBe("Up to 8 weeks ahead");
        expect(personSentence("bookAheadDays", 90)).toBe(
            "Up to 3 months ahead",
        );
        expect(personSentence("gapMinutes", 0)).toBe("No gap needed");
        expect(personSentence("freeCancelHours", 0)).toBe(
            "Free to cancel any time before",
        );
    });

    it("lists the four timing rules, theirs else the business's", () => {
        const rows = personRuleRows(
            { ...SAME_AS_BUSINESS, gapMinutes: 15 },
            BUSINESS,
        );
        expect(rows.map((r) => [r.label, r.sentence, r.own])).toEqual([
            ["Booking late", "Up to 2 hours before the start", false],
            ["Booking ahead", "Up to 4 weeks ahead", false],
            ["Gap between bookings", "15 min between bookings", true],
            ["Cancelling", "Free to cancel up to 24 hours before", false],
        ]);
    });

    it("sums them up for the row", () => {
        expect(rulesSummary(SAME_AS_BUSINESS, "Meera")).toEqual({
            title: "Same as the business",
            sub: "Notice, booking ahead, gaps and cancelling",
        });
        expect(
            rulesSummary(
                { ...SAME_AS_BUSINESS, gapMinutes: 15, bookAheadDays: 56 },
                "Meera",
            ),
        ).toEqual({
            title: "2 rules just for Meera",
            sub: "The rest are the same as the business",
        });
    });

    it("offers Same as the business first, leaves out the business's own value, keeps theirs", () => {
        const choices = personChoices(
            "latestBookingMinutes",
            { ...SAME_AS_BUSINESS, latestBookingMinutes: 45 },
            BUSINESS,
            "Meera",
        );
        expect(choices.map((c) => c.label)).toEqual([
            "Same as the business",
            "Up to 1 hour before the start",
            "Up to 12 hours before the start",
            "Up to 1 day before the start",
            "Up to 45 minutes before the start",
        ]);
        expect(choices[0]).toMatchObject({
            value: SAME,
            note: "Up to 2 hours before the start",
        });
        expect(choiceValue(SAME)).toBeNull();
        expect(choiceValue("720")).toBe(720);
    });

    it("words a save, a request, a wait, a turn-down and an approval", () => {
        expect(personRuleSaved("gapMinutes", null, "Meera")).toBe(
            "Gap between bookings for Meera: same as the business. Saved.",
        );
        const changes = { latestBookingMinutes: 720 };
        expect(askedWords(changes)).toBe(
            "booking late up to 12 hours before the start",
        );
        expect(
            askedWords({ latestBookingMinutes: 720, bookAheadDays: 56 }),
        ).toBe(
            "booking late up to 12 hours before the start and booking up to 8 weeks ahead",
        );
        const r = { changes, staffName: "Arjun Rao" } as RuleRequest;
        expect(requestLine([r], () => "Arjun")).toBe(
            "Arjun wants their own rule: booking late up to 12 hours before the start.",
        );
        expect(waitingLine(changes, SAME_AS_BUSINESS, BUSINESS)).toBe(
            "Booking late: up to 12 hours before the start. Now: up to 2 hours before the start, the same as the business.",
        );
        expect(turnedDownLine(changes, SAME_AS_BUSINESS)).toBe(
            "Booking late up to 12 hours before the start. Your rule stays the same as the business.",
        );
        expect(nowWords("latestBookingMinutes", 720, "Arjun")).toBe(
            "Arjun's bookings now need 12 hours' notice",
        );
        expect(nowWords("latestBookingMinutes", 1440, "Arjun")).toBe(
            "Arjun's bookings now need 1 day's notice",
        );
        expect(ifApproved(changes, "Arjun")).toBe(
            "If you approve, customers can't book Arjun with less than 12 hours' notice.",
        );
    });
});
