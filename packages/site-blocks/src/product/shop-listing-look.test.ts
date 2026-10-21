import { describe, expect, it } from "vitest";

import { parseLeft } from "./shop-listing-look";

describe("parseLeft (review #21)", () => {
    it("reads the slim stock answer into slug → left", () => {
        expect(
            parseLeft({
                items: [
                    {
                        slug: "mango-pickle",
                        listingId: "l1",
                        variantId: null,
                        left: 2,
                        soldOut: false,
                    },
                    {
                        slug: "lime-pickle",
                        listingId: "l2",
                        variantId: "v1",
                        left: null,
                        soldOut: false,
                    },
                ],
            }),
        ).toEqual({ "mango-pickle": 2, "lime-pickle": null });
    });

    it("treats anything else as a bad answer", () => {
        expect(parseLeft(null)).toBeUndefined();
        expect(parseLeft({ products: [] })).toBeUndefined();
        expect(parseLeft({ items: [{ left: 1 }] })).toBeUndefined();
    });
});
