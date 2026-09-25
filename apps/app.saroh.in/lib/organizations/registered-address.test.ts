import { describe, expect, it } from "vitest";

import { addressProblems, printedAddress } from "./registered-address";

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
