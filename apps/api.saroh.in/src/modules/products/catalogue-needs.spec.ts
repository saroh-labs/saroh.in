import type { NeedProduct } from "./catalogue-needs";
import { needsFrom } from "./catalogue-needs";

/**
 * The Products list's "Needs you" (#519): which products, and why — each
 * shelf judged where it is sold, as the Stock screen judges it (#527).
 */
const HILL = { id: "hill", name: "Hill Road" };
const ONLINE = { id: "online", name: "Online" };

const shelf = (
    storeId: string,
    onHand: number,
    promised = 0,
    lowStockAlert = 5,
    variantId: string | null = null,
) => ({ storeId, variantId, onHand, promised, lowStockAlert });

/** A product counted as a whole, sold wherever it has a shelf. */
const whole = (
    id: string,
    shelves: ReturnType<typeof shelf>[],
    sold = shelves.map((s) => s.storeId),
): NeedProduct => ({
    id,
    name: id,
    variants: [],
    listings: sold.map((storeId) => ({ storeId, variants: [] })),
    shelves,
});

describe("needsFrom", () => {
    it("judges each shelf where it is sold, as Stock does", () => {
        // 0 Online, 20 at Hill Road: sold out Online, so it needs you.
        expect(
            needsFrom(
                [whole("loaf", [shelf("hill", 20), shelf("online", 0)])],
                [HILL, ONLINE],
            ),
        ).toEqual([
            {
                productId: "loaf",
                name: "loaf",
                kind: "out",
                short: 0,
                canSell: 0,
                where: ["Online"],
            },
        ]);
    });

    it("takes the worst shelf's reason, and names no place when all are", () => {
        // Low at Hill Road, out Online: out.
        const [bun] = needsFrom(
            [whole("bun", [shelf("hill", 4), shelf("online", 0)])],
            [HILL, ONLINE],
        );
        expect(bun).toMatchObject({ kind: "out", where: ["Online"] });
        // Out at both: no place to single out.
        const [rye] = needsFrom(
            [whole("rye", [shelf("hill", 0), shelf("online", 0)])],
            [HILL, ONLINE],
        );
        expect(rye).toMatchObject({ kind: "out", where: null });
    });

    it("says short before out, and out before low", () => {
        const needs = needsFrom(
            [
                whole("low", [shelf("hill", 3)]),
                whole("out", [shelf("hill", 0)]),
                whole("short", [shelf("hill", 1, 3)]),
                whole("fine", [shelf("hill", 40)]),
            ],
            [HILL],
        );
        expect(needs.map((n) => [n.productId, n.kind])).toEqual([
            ["short", "short"],
            ["out", "out"],
            ["low", "low"],
        ]);
        expect(needs[0]).toMatchObject({ short: 2, canSell: 0, where: null });
    });

    it("counts what can be sold, not what is on the shelf", () => {
        // 6 on hand, all 6 promised: nothing left to sell, nobody short.
        expect(
            needsFrom([whole("loaf", [shelf("hill", 6, 6)])], [HILL]),
        ).toEqual([
            expect.objectContaining({ kind: "out", canSell: 0, short: 0 }),
        ]);
    });

    it("never warns at a warning level of 0", () => {
        expect(
            needsFrom([whole("mug", [shelf("hill", 1, 0, 0)])], [HILL]),
        ).toEqual([]);
    });

    it("warns at each shelf's own level", () => {
        // 3 left at a level of 2 is fine; 1 left at a level of 8 is low.
        expect(
            needsFrom(
                [
                    whole("jam", [
                        shelf("hill", 3, 0, 2),
                        shelf("online", 1, 0, 8),
                    ]),
                ],
                [HILL, ONLINE],
            ),
        ).toEqual([
            expect.objectContaining({
                kind: "low",
                canSell: 1,
                where: ["Online"],
            }),
        ]);
    });

    it("reads a storefront that sells it with no shelf yet as 0, and ignores one that doesn't sell it", () => {
        expect(
            needsFrom(
                [whole("cake", [shelf("hill", 30)], ["hill", "online"])],
                [HILL, ONLINE],
            ),
        ).toEqual([
            expect.objectContaining({ kind: "out", where: ["Online"] }),
        ]);
        expect(
            needsFrom(
                [
                    whole(
                        "cake",
                        [shelf("hill", 30), shelf("online", 0)],
                        ["hill"],
                    ),
                ],
                [HILL, ONLINE],
            ),
        ).toEqual([]);
    });

    it("names the variant, and never judges a per-variant product's own shelf as sold out", () => {
        const product: NeedProduct = {
            id: "bread",
            name: "bread",
            variants: [
                { id: "s", title: "Small" },
                { id: "l", title: "Large" },
            ],
            listings: [
                {
                    storeId: "hill",
                    variants: [{ variantId: "s" }, { variantId: "l" }],
                },
            ],
            shelves: [
                shelf("hill", 0, 0, 5, "s"),
                shelf("hill", 20, 0, 5, "l"),
                // Holds what a line without a variant promised: sells nothing.
                shelf("hill", 2, 2, 5, null),
            ],
        };
        expect(needsFrom([product], [HILL])).toEqual([
            expect.objectContaining({ kind: "out", where: ["Small"] }),
        ]);
    });
});
