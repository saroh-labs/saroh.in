import { describe, expect, it } from "vitest";

import { waitingByOptionWords, waitingCountOf, waitingWords } from "./waiting";

/** Who waits for a product to be back (DEC-174, U24, #1155). */

const titles: Record<string, string> = { blue: "Blue", red: "Red" };
const titleOf = (id: string) => titles[id] ?? null;

describe("waitingWords", () => {
    it("counts people, and says nothing for none", () => {
        expect(waitingWords(3)).toBe("3 people waiting for it");
        expect(waitingWords(1)).toBe("1 person waiting for it");
        expect(waitingWords(0)).toBeNull();
        expect(waitingWords(null)).toBeNull();
        expect(waitingWords(undefined)).toBeNull();
    });
});

describe("waitingByOptionWords", () => {
    it("says nothing when they all wait for the product as a whole", () => {
        expect(
            waitingByOptionWords(
                {
                    productId: "p",
                    waiting: 2,
                    byOption: [{ variantId: null, waiting: 2 }],
                },
                titleOf,
            ),
        ).toBeNull();
    });

    it("names the one option they all wait for", () => {
        expect(
            waitingByOptionWords(
                {
                    productId: "p",
                    waiting: 2,
                    byOption: [{ variantId: "blue", waiting: 2 }],
                },
                titleOf,
            ),
        ).toBe("All for Blue");
    });

    it("lists the options, most first, with any option last", () => {
        expect(
            waitingByOptionWords(
                {
                    productId: "p",
                    waiting: 6,
                    byOption: [
                        { variantId: null, waiting: 1 },
                        { variantId: "red", waiting: 2 },
                        { variantId: "blue", waiting: 3 },
                    ],
                },
                titleOf,
            ),
        ).toBe("3 for Blue, 2 for Red, 1 for any");
    });

    it("says so for an option no longer sold", () => {
        expect(
            waitingByOptionWords(
                {
                    productId: "p",
                    waiting: 2,
                    byOption: [
                        { variantId: "gone", waiting: 1 },
                        { variantId: "blue", waiting: 1 },
                    ],
                },
                titleOf,
            ),
        ).toBe("1 for an option no longer sold, 1 for Blue");
    });
});

describe("waitingCountOf", () => {
    it("narrows the API's answer, and refuses anything else", () => {
        const good = {
            productId: "p",
            waiting: 1,
            byOption: [{ variantId: null, waiting: 1 }],
        };
        expect(waitingCountOf(good)).toEqual(good);
        expect(waitingCountOf({ ...good, waiting: -1 })).toBeNull();
        expect(waitingCountOf({ ...good, waiting: "1" })).toBeNull();
        expect(
            waitingCountOf({
                ...good,
                byOption: [{ variantId: 3, waiting: 1 }],
            }),
        ).toBeNull();
        expect(waitingCountOf(null)).toBeNull();
    });
});
