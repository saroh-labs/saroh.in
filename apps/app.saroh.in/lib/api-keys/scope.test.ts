import { describe, expect, it } from "vitest";

import {
    canDoLine,
    levelsOf,
    NEW_KEY_LEVELS,
    originsFrom,
    originsLine,
    scopeOf,
} from "./scope";

describe("a key's scope", () => {
    it("asks See with Change, and only what the maker may do", () => {
        const scope = scopeOf(
            { ...NEW_KEY_LEVELS, catalogue: "change", orders: "see" },
            (a) => a !== "inventory:write",
        );
        expect(scope).toEqual([
            "store:read",
            "service:read",
            "site:read",
            "subscription:read",
            "store:write",
            "service:write",
            "order:read",
        ]);
    });

    it("reads back into levels, a change action making Change", () => {
        expect(levelsOf(["store:read", "store:write", "lead:read"])).toEqual({
            catalogue: "change",
            bookings: "none",
            orders: "none",
            customers: "none",
            enquiries: "see",
        });
    });

    it("says what a key can do as the row does", () => {
        expect(canDoLine(["store:read", "store:write"], true)).toBe(
            "Catalogue: see and change · AI apps",
        );
        expect(canDoLine(["order:read", "contact:read"])).toBe(
            "Orders and customers: see",
        );
        expect(canDoLine(["booking:read", "order:read", "lead:read"])).toBe(
            "Bookings, orders and enquiries: see",
        );
    });

    it("takes a website key's addresses one a line, https by default", () => {
        expect(
            originsFrom("rye.example.com\n https://shop.example.com/ \n\n"),
        ).toEqual(["https://rye.example.com", "https://shop.example.com/"]);
        expect(
            originsLine(["https://rye.example.com", "http://localhost:3000"]),
        ).toBe("rye.example.com, localhost:3000");
    });
});
