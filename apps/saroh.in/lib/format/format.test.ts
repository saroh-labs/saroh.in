import { describe, expect, it } from "vitest";

import { formatDay, formatTime } from "./day";
import { sentenceList } from "./list";
import { numberWord } from "./number-words";

describe("formatDay", () => {
    it("writes each of the site's shapes", () => {
        expect(formatDay("2026-10-17", { month: "short", year: true })).toBe(
            "17 Oct 2026",
        );
        expect(formatDay("2026-10-17", { month: "long", year: true })).toBe(
            "17 October 2026",
        );
        expect(formatDay("2026-10-17", { month: "long" })).toBe("17 October");
        expect(formatDay("2026-03-05", { month: "short" })).toBe("5 Mar");
        expect(
            formatDay("2026-03-03", { weekday: "short", month: "short" }),
        ).toBe("Tue 3 Mar");
        expect(
            formatDay("2026-03-03", { weekday: "long", month: "long" }),
        ).toBe("Tuesday 3 March");
    });

    it("keeps the day in India whatever the machine's zone", () => {
        expect(formatDay("2026-01-01", { month: "short", year: true })).toBe(
            "1 Jan 2026",
        );
    });
});

describe("formatTime", () => {
    it("writes India's clock, am/pm in lower case", () => {
        expect(formatTime(new Date("2026-10-17T14:12:00Z"))).toBe("7:42 pm");
    });
});

describe("sentenceList", () => {
    it("joins with commas and a last 'and'", () => {
        expect(sentenceList([])).toBe("");
        expect(sentenceList(["a"])).toBe("a");
        expect(sentenceList(["a", "b"])).toBe("a and b");
        expect(sentenceList(["a", "b", "c"])).toBe("a, b and c");
    });
});

describe("numberWord", () => {
    it("writes up to twelve as a word, then digits", () => {
        expect(numberWord(7)).toBe("seven");
        expect(numberWord(7, { capital: true })).toBe("Seven");
        expect(numberWord(0, { capital: true })).toBe("No");
        expect(numberWord(13)).toBe("13");
    });
});
