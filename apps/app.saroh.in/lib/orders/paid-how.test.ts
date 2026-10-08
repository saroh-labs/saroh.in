import { describe, expect, it } from "vitest";

import { PAID_HOW, paidByHandWords } from "./paid-how";

describe("paid-how (#834)", () => {
    it("offers the five ways, in order", () => {
        expect(PAID_HOW.map((w) => w.label)).toEqual([
            "Cash",
            "UPI",
            "Bank transfer",
            "Card at the counter",
            "Other",
        ]);
    });

    it("words Paid by with the way, or only by hand", () => {
        expect(paidByHandWords("BANK_TRANSFER")).toBe(
            "Bank transfer · recorded by hand",
        );
        expect(paidByHandWords("CARD")).toBe(
            "Card at the counter · recorded by hand",
        );
        expect(paidByHandWords(null)).toBe("Recorded by hand");
        expect(paidByHandWords(undefined)).toBe("Recorded by hand");
    });
});
