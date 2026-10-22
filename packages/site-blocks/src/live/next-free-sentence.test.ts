import { describe, expect, it } from "vitest";

import { nextFreeSentence } from "./next-free-sentence";

const today = "2026-10-21";

describe("nextFreeSentence (Folio's next booking)", () => {
    it("names the time's person and says when, today", () => {
        expect(
            nextFreeSentence(
                {
                    serviceName: "Hatha yoga",
                    staffName: "Meera",
                    date: today,
                    time: "07:00",
                },
                today,
            ),
        ).toEqual({
            article: "a",
            what: "Hatha yoga",
            who: "Meera",
            when: "today at 7:00 am",
        });
    });

    it("says anyone free for no person, and an before a vowel", () => {
        const words = nextFreeSentence(
            {
                serviceName: "Intro class",
                staffName: null,
                date: "2026-10-22",
                time: "17:30",
            },
            today,
        );
        expect(words.article).toBe("an");
        expect(words.who).toBe("anyone free");
        expect(words.when).toBe("tomorrow at 5:30 pm");
    });
});
