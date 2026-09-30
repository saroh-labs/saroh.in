import { describe, expect, it } from "vitest";

import { sellsFromLine } from "./sells-from";

describe("sellsFromLine (G11)", () => {
    const online = { id: "st_online", name: "Online", products: 12 };
    const hill = { id: "st_hill", name: "Hill Road", products: 4 };

    it("says where the site sells from once it is set", () => {
        expect(
            sellsFromLine({
                storefront: { id: online.id, name: "Online" },
                choices: [online],
            }),
        ).toBe("Your online shop sells from Online");
    });

    it("says the shop shows nothing until one is picked", () => {
        expect(
            sellsFromLine({ storefront: null, choices: [online, hill] }),
        ).toMatch(/Not chosen yet/);
    });

    it("says where products live when no location sells any", () => {
        expect(sellsFromLine({ storefront: null, choices: [] })).toMatch(
            /Sell › Products/,
        );
    });
});
