import { describe, expect, it } from "vitest";

import { pickStorefront } from "./pick";

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
