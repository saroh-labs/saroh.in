import { describe, expect, it } from "vitest";

import { lateAfterField, lateAfterMinutes, lateAfterWords } from "./late-after";

describe("the late-after field (B17)", () => {
    it("shows hours, and minutes when it isn't a whole number of hours", () => {
        expect(lateAfterField(120)).toEqual({ amount: "2", unit: "hours" });
        expect(lateAfterField(2880)).toEqual({ amount: "48", unit: "hours" });
        expect(lateAfterField(20)).toEqual({ amount: "20", unit: "minutes" });
        expect(lateAfterField(90)).toEqual({ amount: "90", unit: "minutes" });
    });

    it("saves whole minutes from 5 to 30 days", () => {
        expect(lateAfterMinutes("20", "minutes")).toEqual({
            ok: true,
            minutes: 20,
        });
        expect(lateAfterMinutes(" 72 ", "hours")).toEqual({
            ok: true,
            minutes: 4320,
        });
        expect(lateAfterMinutes("5", "minutes")).toMatchObject({ ok: true });
        expect(lateAfterMinutes("720", "hours")).toMatchObject({ ok: true });
    });

    it("says why 0, 3 minutes, 31 days or a fraction can't be saved", () => {
        expect(lateAfterMinutes("0", "hours")).toEqual({
            ok: false,
            error: "5 minutes at the soonest.",
        });
        expect(lateAfterMinutes("3", "minutes")).toMatchObject({
            error: "5 minutes at the soonest.",
        });
        expect(lateAfterMinutes("744", "hours")).toMatchObject({
            error: "30 days at the most.",
        });
        expect(lateAfterMinutes("1.5", "hours")).toMatchObject({
            error: "A whole number of hours. For part of an hour, choose minutes.",
        });
        expect(lateAfterMinutes("", "minutes")).toMatchObject({ ok: false });
    });

    it("says a threshold in words", () => {
        expect(lateAfterWords(120)).toBe("2 hours");
        expect(lateAfterWords(60)).toBe("1 hour");
        expect(lateAfterWords(20)).toBe("20 minutes");
        expect(lateAfterWords(1)).toBe("1 minute");
    });
});
