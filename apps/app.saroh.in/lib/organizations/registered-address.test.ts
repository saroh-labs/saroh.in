import type { Edition } from "@saroh/edition";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    addressProblems,
    printedAddress,
    stateProblem,
} from "./registered-address";

const edition: { name: Edition } = vi.hoisted(() => ({ name: "INDIA" }));
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        ...(await actual<object>()),
        get PROFILE() {
            return editionProfile(edition.name);
        },
    };
});
afterEach(() => {
    edition.name = "INDIA";
});

const RYE = {
    line1: "3 Hill Road",
    line2: "Indiranagar",
    city: "Bengaluru",
    postalCode: "560038",
    state: "29",
    stateName: "Karnataka",
};

describe("the registered address as it prints", () => {
    it("is one line, as the API freezes it on an invoice", () => {
        expect(printedAddress(RYE)).toBe(
            "3 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        );
        expect(printedAddress({ ...RYE, line2: null, stateName: null })).toBe(
            "3 Hill Road, Bengaluru 560038",
        );
    });

    it("is nothing without a first line", () => {
        expect(printedAddress({ ...RYE, line1: " " })).toBeNull();
        expect(printedAddress(undefined)).toBeNull();
    });
});

describe("what the settings form refuses before the API does", () => {
    const filled = {
        gstRegistered: true,
        country: "IN",
        addressLine1: "3 Hill Road",
        city: "Bengaluru",
        postalCode: "560 038",
    };

    it("takes a whole address, a PIN written with a space included", () => {
        expect(addressProblems(filled)).toEqual([]);
    });

    it("asks a registered business for each missing line", () => {
        expect(
            addressProblems({
                ...filled,
                addressLine1: "",
                city: " ",
                postalCode: "",
            }).map((p) => p.path),
        ).toEqual(["addressLine1", "city", "postalCode"]);
    });

    it("refuses a PIN that is not six digits in India, not elsewhere", () => {
        expect(addressProblems({ ...filled, postalCode: "56003" })).toEqual([
            expect.objectContaining({ path: "postalCode" }),
        ]);
        expect(
            addressProblems({
                ...filled,
                gstRegistered: false,
                country: "GB",
                postalCode: "SW1A 1AA",
            }),
        ).toEqual([]);
    });

    it("reads India by its name too, and asks no PIN shape of a blank country, as the API", () => {
        const unregistered = { ...filled, gstRegistered: false };
        expect(
            addressProblems({
                ...unregistered,
                country: "india",
                postalCode: "56003",
            }).map((p) => p.path),
        ).toEqual(["postalCode"]);
        expect(
            addressProblems({
                ...unregistered,
                country: "",
                postalCode: "56003",
            }),
        ).toEqual([]);
    });

    it("leaves an unregistered business free to have no address", () => {
        expect(
            addressProblems({
                gstRegistered: false,
                country: "IN",
                addressLine1: "",
                city: "",
                postalCode: "",
            }),
        ).toEqual([]);
    });
});

describe("stateProblem (UX-018)", () => {
    const typed = {
        gstRegistered: false,
        country: "IN",
        gstState: "",
        addressLine1: "12 Hill Road",
        city: "Bengaluru",
        postalCode: "560001",
    };

    it("asks an Indian address being filled in for its state", () => {
        expect(stateProblem(typed)).toMatch(/^Choose your state/);
        expect(stateProblem({ ...typed, country: "" })).toMatch(/state/);
    });

    it("is fine with a state, abroad, registered, or no address at all", () => {
        expect(stateProblem({ ...typed, gstState: "29" })).toBeNull();
        expect(stateProblem({ ...typed, country: "GB" })).toBeNull();
        expect(stateProblem({ ...typed, gstRegistered: true })).toBeNull();
        expect(
            stateProblem({
                ...typed,
                addressLine1: "",
                city: "",
                postalCode: "",
            }),
        ).toBeNull();
    });
});

describe("a Global address in Settings, by its country (U3)", () => {
    const us = {
        gstRegistered: false,
        country: "US",
        addressLine1: "1 Main St",
        city: "New Delhi",
        postalCode: "110001",
        region: "",
    };

    it("refuses an Indian PIN and no state for a US business", () => {
        edition.name = "GLOBAL";
        expect(addressProblems(us).map((p) => p.path)).toEqual([
            "postalCode",
            "region",
        ]);
        expect(
            addressProblems({ ...us, postalCode: "78701", region: "TX" }),
        ).toEqual([]);
    });

    it("asks nothing of an address left blank", () => {
        edition.name = "GLOBAL";
        expect(
            addressProblems({
                ...us,
                addressLine1: "",
                city: "",
                postalCode: "",
            }),
        ).toEqual([]);
    });

    it("never asks a Global business with a blank country for an Indian state", () => {
        edition.name = "GLOBAL";
        expect(stateProblem({ ...us, country: "", gstState: "" })).toBeNull();
    });

    it("leaves India's rules as they were", () => {
        expect(
            addressProblems({ ...us, country: "IN", postalCode: "78701" }),
        ).toEqual([
            {
                path: "postalCode",
                message: "A PIN code is six digits, like 560038.",
            },
        ]);
    });
});

describe("a Global address as it prints (U4)", () => {
    const US = {
        ...RYE,
        line2: null,
        city: "Austin",
        postalCode: "78701",
        state: null,
        stateName: null,
        region: "TX",
    };

    it("names the region before the ZIP code, and the country last", () => {
        edition.name = "GLOBAL";
        expect(printedAddress({ ...US, line1: "500 Congress Ave" }, "US")).toBe(
            "500 Congress Ave, Austin, TX 78701, United States",
        );
        expect(
            printedAddress(
                {
                    ...US,
                    line1: "10 Downing St",
                    city: "London",
                    postalCode: "SW1A 2AA",
                    region: null,
                },
                "GB",
            ),
        ).toBe("10 Downing St, London SW1A 2AA, United Kingdom");
    });

    it("prints India's exactly as before, with or without the country", () => {
        expect(printedAddress(RYE, "IN")).toBe(printedAddress(RYE));
        expect(printedAddress({ ...RYE, region: "KA" }, "IN")).toBe(
            "3 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
        );
    });
});
