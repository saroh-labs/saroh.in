import { isShopPath } from "./sells-from";
import { checkShop } from "./site-flags";

/**
 * The shop's pre-publish questions (G11). The service asks only while the
 * shop is open for the business and Commerce is on; these are the rules.
 */
describe("checkShop", () => {
    const home = { id: "p_home", path: "/", hidden: false };

    it("asks which storefront when none is chosen and there is one to choose", () => {
        const flags = checkShop({
            storefrontChosen: false,
            candidates: 2,
            pages: [home],
            isShopPath,
        });
        expect(flags).toEqual([
            expect.objectContaining({
                type: "storefrontUnchosen",
                pageId: null,
                field: "storefrontId",
                message: expect.stringContaining(
                    "Pick which storefront this site sells from",
                ),
            }),
        ]);
    });

    it("asks nothing once one is chosen, or when nothing is sold anywhere", () => {
        expect(
            checkShop({
                storefrontChosen: true,
                candidates: 2,
                pages: [home],
                isShopPath,
            }),
        ).toEqual([]);
        expect(
            checkShop({
                storefrontChosen: false,
                candidates: 0,
                pages: [home],
                isShopPath,
            }),
        ).toEqual([]);
    });

    it("flags a page of the merchant's own at /shop, on that page, with a new address to find", () => {
        const flags = checkShop({
            storefrontChosen: true,
            candidates: 1,
            pages: [
                home,
                { id: "p_shop", path: "/shop", hidden: false },
                { id: "p_under", path: "/shop/gifts", hidden: false },
                { id: "p_near", path: "/shopping", hidden: false },
            ],
            isShopPath,
        });
        expect(flags.map((f) => [f.type, f.pageId])).toEqual([
            ["reservedAddress", "p_shop"],
            ["reservedAddress", "p_under"],
        ]);
        expect(flags[0]?.message).toMatch(/Change its address/);
    });

    it("says nothing about a hidden page, which isn't on the site", () => {
        expect(
            checkShop({
                storefrontChosen: true,
                candidates: 1,
                pages: [{ id: "p_shop", path: "/shop", hidden: true }],
                isShopPath,
            }),
        ).toEqual([]);
    });
});

describe("isShopPath", () => {
    it.each([
        ["/shop", true],
        ["/shop/", true],
        ["/Shop", true],
        ["/shop/bread", true],
        ["/shopping", false],
        ["/", false],
        ["/about/shop", false],
    ])("%s → %s", (path, expected) => {
        expect(isShopPath(path)).toBe(expected);
    });
});
