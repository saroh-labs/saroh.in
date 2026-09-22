import { describe, expect, it } from "vitest";

import { endOfDay, fromReach, NO_SELECTIONS, toReach } from "./reach";

describe("toReach", () => {
    it("sends no targets for the whole business", () => {
        expect(
            toReach("BUSINESS", { ...NO_SELECTIONS, PRODUCT: ["p_1"] }),
        ).toEqual({ appliesTo: "BUSINESS", targetIds: [] });
    });

    it("sends both storefronts picked", () => {
        expect(
            toReach("STOREFRONT", {
                ...NO_SELECTIONS,
                STOREFRONT: ["s_1", "s_2"],
            }),
        ).toEqual({ appliesTo: "STOREFRONT", targetIds: ["s_1", "s_2"] });
    });

    it("sends only the current mode's picks after switching", () => {
        const picked = {
            ...NO_SELECTIONS,
            PRODUCT: ["p_1"],
            COLLECTION: ["c_1"],
        };
        expect(toReach("COLLECTION", picked).targetIds).toEqual(["c_1"]);
    });
});

describe("fromReach", () => {
    it("puts an existing code's targets under its own mode", () => {
        expect(fromReach("PRODUCT", ["p_1"])).toEqual({
            ...NO_SELECTIONS,
            PRODUCT: ["p_1"],
        });
    });
});

describe("endOfDay", () => {
    it("is the last instant of the picked day, locally", () => {
        const end = new Date(endOfDay(new Date(2026, 8, 30, 10)));
        expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([
            30, 23, 59,
        ]);
    });
});
