import { describe, expect, it } from "vitest";

import { placesFromOf, placesWord } from "../lib/timetable-read";
import { placesLeftWords } from "./live-words";

describe("places left from N (KD8)", () => {
    it("set to 3: no count at 4, a count at 3, Last place at 1", () => {
        expect(placesLeftWords(4, { short: true, from: 3 })).toBeNull();
        expect(placesLeftWords(3, { short: true, from: 3 })).toBe("3 left");
        expect(placesLeftWords(1, { from: 3 })).toBe("Last place");
        expect(placesLeftWords(0, { from: 3 })).toBeNull();
    });

    it("absent keeps the live rule: 5 or fewer", () => {
        expect(placesLeftWords(5)).toBe("5 places left");
        expect(placesLeftWords(6)).toBeNull();
    });

    it("set, it replaces Classic's fifth; absent, Classic is unchanged", () => {
        const session = { placesLeft: 4, capacity: 20 };
        expect(placesWord(session, true)?.text).toBe("Fills fast · 4 left");
        expect(placesWord(session, true, 3)?.text).toBe("4 places");
        expect(placesWord({ placesLeft: 3, capacity: 20 }, true, 3)?.text).toBe(
            "Fills fast · 3 left",
        );
        expect(
            placesWord({ placesLeft: 0, capacity: 20 }, false, 3)?.text,
        ).toBe("Full");
        // At least two, a fifth of capacity, when absent.
        expect(placesWord({ placesLeft: 2, capacity: 6 }, true)?.tone).toBe(
            "filling",
        );
    });

    it("reads a stored number only when it is 1 to 10", () => {
        expect(placesFromOf({ placesFrom: 3 })).toBe(3);
        expect(placesFromOf({})).toBeUndefined();
        expect(placesFromOf({ placesFrom: 0 })).toBeUndefined();
        expect(placesFromOf({ placesFrom: 11 })).toBeUndefined();
        expect(placesFromOf({ placesFrom: 2.5 })).toBeUndefined();
    });
});
