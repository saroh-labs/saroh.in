import { describe, expect, it } from "vitest";

import type { ProductListingView } from "./listing-changes";
import {
    listedAt,
    listingChanges,
    newVariantStores,
    soldAtFrom,
    soldAtSummary,
} from "./listing-changes";

const HILL = "st_hill";
const ONLINE = "st_online";
const STORES = [
    { id: HILL, name: "Hill Road" },
    { id: ONLINE, name: "Online" },
];

function listing(
    storeId: string,
    listed: boolean,
    sold: Record<string, boolean>,
): ProductListingView {
    return {
        storeId,
        storeName: storeId,
        listed,
        variants: Object.entries(sold).map(([variantId, soldHere]) => ({
            variantId,
            soldHere,
        })),
    };
}

describe("soldAtFrom", () => {
    it("names the storefronts that sell each variant", () => {
        const read = [
            listing(HILL, true, { v1: true, v2: true }),
            listing(ONLINE, true, { v1: true, v2: false }),
        ];
        expect(soldAtFrom(read)).toEqual({ v1: [HILL, ONLINE], v2: [HILL] });
    });

    it("ignores a storefront that doesn't list the product", () => {
        const read = [
            listing(HILL, true, { v1: true }),
            listing(ONLINE, false, { v1: true }),
        ];
        expect(soldAtFrom(read)).toEqual({ v1: [HILL] });
        expect(listedAt(read)).toEqual([HILL]);
    });
});

describe("newVariantStores", () => {
    it("starts where the product is listed", () => {
        expect(
            newVariantStores([
                listing(HILL, true, {}),
                listing(ONLINE, false, {}),
            ]),
        ).toEqual([HILL]);
    });

    it("starts everywhere when it is listed nowhere", () => {
        expect(
            newVariantStores([
                listing(HILL, false, {}),
                listing(ONLINE, false, {}),
            ]),
        ).toEqual([HILL, ONLINE]);
    });
});

describe("listingChanges", () => {
    const both = { v1: [HILL, ONLINE], v2: [HILL, ONLINE] };

    it("changes nothing when nothing moved", () => {
        expect(
            listingChanges({
                storeIds: [HILL, ONLINE],
                listed: [HILL, ONLINE],
                order: ["v1", "v2"],
                before: both,
                wanted: both,
            }),
        ).toEqual([]);
    });

    it("unticking Online for a variant takes it off Online's listing", () => {
        expect(
            listingChanges({
                storeIds: [HILL, ONLINE],
                listed: [HILL, ONLINE],
                order: ["v1", "v2"],
                before: both,
                wanted: { v1: [HILL, ONLINE], v2: [HILL] },
            }),
        ).toEqual([{ storeId: ONLINE, variantIds: ["v1"] }]);
    });

    it("stops selling at a storefront left with no variant", () => {
        expect(
            listingChanges({
                storeIds: [HILL, ONLINE],
                listed: [HILL, ONLINE],
                order: ["v1", "v2"],
                before: both,
                wanted: { v1: [HILL], v2: [HILL] },
            }),
        ).toEqual([{ storeId: ONLINE, unlist: true }]);
    });

    it("lists it at a storefront that didn't sell it", () => {
        expect(
            listingChanges({
                storeIds: [HILL, ONLINE],
                listed: [HILL],
                order: ["v1", "v2"],
                before: { v1: [HILL], v2: [HILL] },
                wanted: { v1: [HILL], v2: [HILL, ONLINE] },
            }),
        ).toEqual([{ storeId: ONLINE, variantIds: ["v2"] }]);
    });

    it("reads a variant just made as sold wherever the product is listed", () => {
        // v3 is new: the API put it on both listings, and it was wanted at
        // Hill Road only.
        expect(
            listingChanges({
                storeIds: [HILL, ONLINE],
                listed: [HILL, ONLINE],
                order: ["v1", "v3"],
                before: { v1: [HILL, ONLINE] },
                wanted: { v1: [HILL, ONLINE], v3: [HILL] },
            }),
        ).toEqual([{ storeId: ONLINE, variantIds: ["v1"] }]);
    });

    it("keeps the list's order in what it sends", () => {
        expect(
            listingChanges({
                storeIds: [ONLINE],
                listed: [],
                order: ["v2", "v1"],
                before: {},
                wanted: { v1: [ONLINE], v2: [ONLINE] },
            }),
        ).toEqual([{ storeId: ONLINE, variantIds: ["v2", "v1"] }]);
    });
});

describe("soldAtSummary", () => {
    it("names the storefronts in their order", () => {
        expect(soldAtSummary(STORES, [ONLINE, HILL])).toBe("Hill Road, Online");
    });

    it("says when it is sold nowhere", () => {
        expect(soldAtSummary(STORES, [])).toBe("not sold anywhere");
    });
});
