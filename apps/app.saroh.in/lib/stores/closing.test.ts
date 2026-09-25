import { describe, expect, it } from "vitest";

import { heldStock } from "./closing";

describe("heldStock — why a storefront can't close yet (#512)", () => {
    it("says nothing when the storefront holds no stock", () => {
        expect(heldStock({ stock: { onHand: 0, promised: 0 } })).toBeNull();
        // An API from before the field: nothing to say, and the API decides.
        expect(heldStock({})).toBeNull();
    });

    it("names what is on the shelf and what is promised", () => {
        expect(heldStock({ stock: { onHand: 3, promised: 0 } })).toBe(
            "It still has 3 on the shelf.",
        );
        expect(heldStock({ stock: { onHand: 0, promised: 2 } })).toBe(
            "It still has 2 promised to orders.",
        );
        expect(heldStock({ stock: { onHand: 12, promised: 3 } })).toBe(
            "It still has 12 on the shelf and 3 promised to orders.",
        );
    });
});
