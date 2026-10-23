import { describe, expect, it } from "vitest";

import {
    narrowedBy,
    readUserListQuery,
    searchable,
    toggleChip,
    userListHref,
} from "./user-filters";

describe("the Users list's address (U9)", () => {
    it("reads the search and the chips, dropping unknown chips, in the toolbar's order", () => {
        expect(
            readUserListQuery({
                q: "  asha ",
                filter: "owners,bogus,no-business",
            }),
        ).toEqual({ q: "asha", chips: ["no-business", "owners"] });
        expect(readUserListQuery({})).toEqual({ q: "", chips: [] });
        expect(readUserListQuery({ q: ["a", "b"], filter: [] })).toEqual({
            q: "a",
            chips: [],
        });
    });

    it("writes it back, and the plain list has no query string", () => {
        expect(userListHref({ q: "", chips: [] })).toBe("/users");
        expect(
            userListHref({ q: "asha", chips: ["unverified", "owners"] }),
        ).toBe("/users?q=asha&filter=unverified%2Cowners");
        const round = readUserListQuery(
            Object.fromEntries(
                new URLSearchParams(
                    userListHref({ q: "a b", chips: ["owners"] }).split("?")[1],
                ),
            ),
        );
        expect(round).toEqual({ q: "a b", chips: ["owners"] });
    });

    it("turns a chip on and off, keeping the others", () => {
        const base = { q: "x", chips: ["owners" as const] };
        expect(toggleChip(base, "no-business").chips).toEqual([
            "no-business",
            "owners",
        ]);
        expect(toggleChip(base, "owners").chips).toEqual([]);
        expect(toggleChip(base, "owners").q).toBe("x");
    });

    it("says what narrows the list, for the right way back", () => {
        expect(narrowedBy({ q: "", chips: [] })).toBeNull();
        expect(narrowedBy({ q: "asha", chips: [] })).toBe("search");
        expect(narrowedBy({ q: "asha", chips: ["owners"] })).toBe("filters");
        expect(searchable("a")).toBe(false);
        expect(searchable(" ab ")).toBe(true);
    });
});
