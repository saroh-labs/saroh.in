import { afterEach, describe, expect, it, vi } from "vitest";

import {
    addToBag,
    bagCount,
    clearBag,
    MAX_BAG_ITEMS,
    MAX_ITEM_QUANTITY,
    parseBag,
    readBag,
    setQuantity,
} from "./bag-store";

/**
 * The bag in the browser (G13): per site, ids and quantities only, and
 * never a broken page when storage is refused.
 */

afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
});

const sourdough = { listingId: "l-sourdough", variantId: null, quantity: 1 };

describe("the bag in the browser", () => {
    it("keeps one bag per site, holding ids and quantities only", () => {
        addToBag("site-a", sourdough);
        addToBag("site-a", { ...sourdough, quantity: 2 });
        addToBag("site-a", {
            listingId: "l-focaccia",
            variantId: "v-large",
            quantity: 1,
        });
        expect(readBag("site-a")).toEqual([
            { listingId: "l-sourdough", variantId: null, quantity: 3 },
            { listingId: "l-focaccia", variantId: "v-large", quantity: 1 },
        ]);
        expect(readBag("site-b")).toEqual([]);
        const stored = JSON.parse(
            window.localStorage.getItem("saroh.bag.site-a") ?? "[]",
        ) as Record<string, unknown>[];
        expect(Object.keys(stored[0] ?? {})).toEqual([
            "listingId",
            "variantId",
            "quantity",
        ]);
        expect(bagCount(readBag("site-a"))).toBe(4);
    });

    it("treats another option of the same product as another line", () => {
        addToBag("s", { listingId: "l", variantId: "small", quantity: 1 });
        addToBag("s", { listingId: "l", variantId: "large", quantity: 1 });
        expect(readBag("s")).toHaveLength(2);
    });

    it("caps a line's quantity and the number of lines", () => {
        addToBag("s", { ...sourdough, quantity: 90 });
        addToBag("s", { ...sourdough, quantity: 90 });
        expect(readBag("s")[0]?.quantity).toBe(MAX_ITEM_QUANTITY);
        for (let i = 0; i < MAX_BAG_ITEMS + 5; i++) {
            addToBag("t", { listingId: `l${i}`, variantId: null, quantity: 1 });
        }
        expect(readBag("t")).toHaveLength(MAX_BAG_ITEMS);
    });

    it("sets a quantity, and takes a line out at 0", () => {
        addToBag("s", sourdough);
        setQuantity("s", sourdough, 4);
        expect(readBag("s")[0]?.quantity).toBe(4);
        setQuantity("s", sourdough, 0);
        expect(readBag("s")).toEqual([]);
        expect(window.localStorage.getItem("saroh.bag.s")).toBeNull();
    });

    it("empties once the order is placed", () => {
        addToBag("s", sourdough);
        clearBag("s");
        expect(readBag("s")).toEqual([]);
    });

    it("reads anything it didn't write as an empty bag", () => {
        expect(parseBag("not json")).toEqual([]);
        expect(parseBag('{"a":1}')).toEqual([]);
        expect(
            parseBag(
                JSON.stringify([
                    { listingId: "ok", variantId: null, quantity: 2 },
                    { listingId: "", variantId: null, quantity: 1 },
                    { listingId: "neg", variantId: null, quantity: -1 },
                    { listingId: "price", variantId: null, quantity: 1.5 },
                ]),
            ),
        ).toEqual([{ listingId: "ok", variantId: null, quantity: 2 }]);
    });

    it("still works for the visit when storage is refused", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        expect(() => addToBag("p", sourdough)).not.toThrow();
        expect(addToBag("p", sourdough)[0]?.quantity).toBe(2);
    });
});
