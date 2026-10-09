import { describe, expect, it } from "vitest";

import { locationsWord, pickStorefront } from "./pick";

const HILL = { id: "st_hill", name: "Hill Road" };
const ONLINE = { id: "st_online", name: "Online" };

describe("pickStorefront — a page at one storefront", () => {
    it("uses the only storefront, with no question asked", () => {
        expect(pickStorefront([HILL], undefined)).toBe(HILL);
        // An old or wrong link still lands on the only one.
        expect(pickStorefront([HILL], "st_gone")).toBe(HILL);
    });

    it("asks which when there are several and none is named", () => {
        expect(pickStorefront([HILL, ONLINE], undefined)).toBeUndefined();
        expect(pickStorefront([HILL, ONLINE], "st_gone")).toBeUndefined();
    });

    it("uses the one the address names", () => {
        expect(pickStorefront([HILL, ONLINE], "st_online")).toBe(ONLINE);
    });

    it("has nothing to use in a business with none", () => {
        expect(pickStorefront([], undefined)).toBeUndefined();
    });
});

describe("locationsWord — the row's name follows the count (UX-078)", () => {
    it("is singular for one, none or an unknown count", () => {
        expect(locationsWord(1)).toBe("Location");
        expect(locationsWord(0)).toBe("Location");
        expect(locationsWord(null)).toBe("Location");
        expect(locationsWord(undefined)).toBe("Location");
    });

    it("is plural for several", () => {
        expect(locationsWord(2)).toBe("Locations");
        expect(locationsWord(5)).toBe("Locations");
    });
});
