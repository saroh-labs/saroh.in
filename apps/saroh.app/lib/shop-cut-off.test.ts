import { describe, expect, it } from "vitest";

import { shopCutOff } from "./shop-cut-off";

const grid = (cutOff?: unknown) => ({
    type: "productGrid",
    content: cutOff === undefined ? {} : { cutOff },
});

describe("the owner's cut-off line for the shop", () => {
    it("is none when no Product grid has one", () => {
        expect(shopCutOff({ pages: [] })).toBeNull();
        expect(
            shopCutOff({ pages: [{ sections: [grid(), grid("   ")] }] }),
        ).toBeNull();
    });

    it("is the owner's words, trimmed, home page first", () => {
        expect(
            shopCutOff({
                pages: [
                    { isHome: false, sections: [grid("Order by 6 pm")] },
                    { isHome: true, sections: [grid(" Order by 9 pm ")] },
                ],
            }),
        ).toBe("Order by 9 pm");
    });

    it("ignores other sections and content that isn't words", () => {
        expect(
            shopCutOff({
                pages: [
                    {
                        sections: [
                            { type: "hero", content: { cutOff: "x" } },
                            grid(42),
                            { type: "productGrid", content: null },
                        ],
                    },
                ],
            }),
        ).toBeNull();
    });
});
