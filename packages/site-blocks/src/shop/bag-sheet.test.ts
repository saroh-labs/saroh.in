import { describe, expect, it } from "vitest";

import { payWords } from "./bag-sheet";

/**
 * The line above the bag's button (#837): it says how the customer pays only
 * once the quote is back, so a shop that takes money at the handover never
 * first claims "You pay online" while prices load.
 */
describe("payWords", () => {
    it("says nothing about paying before the quote is back", () => {
        expect(payWords(null)).toBeNull();
    });

    it("says online once the quote offers it", () => {
        expect(payWords({ type: "ONLINE", label: "Pay online" })).toMatch(
            /^You pay online in a secure window/,
        );
    });

    it("says at the handover once the quote offers only that", () => {
        expect(
            payWords({ type: "ON_HANDOVER", label: "Pay when you collect" }),
        ).toBe(
            "You'll pay when you collect your order. Your order is placed now.",
        );
    });
});
