import { describe, expect, it } from "vitest";

import {
    checkDeliveryPlace,
    joinDeliveryPlace,
    splitDeliveryPlace,
} from "./delivery-place";

describe("a Global delivery's region and country on one line", () => {
    it("joins what it has", () => {
        expect(joinDeliveryPlace(" Texas ", "us")).toBe("Texas, United States");
        expect(joinDeliveryPlace("", "AE")).toBe("United Arab Emirates");
        expect(joinDeliveryPlace("Texas", null)).toBe("Texas");
        // India's: the state as stored, and nothing at all is no line.
        expect(joinDeliveryPlace("Karnataka", null)).toBe("Karnataka");
        expect(joinDeliveryPlace(null, null)).toBe("");
    });

    it("comes apart again, a US state named like a country included", () => {
        expect(splitDeliveryPlace("Georgia, United States")).toEqual({
            region: "Georgia",
            country: "US",
        });
        expect(splitDeliveryPlace("United Kingdom")).toEqual({
            region: "",
            country: "GB",
        });
        expect(splitDeliveryPlace("Somewhere")).toEqual({
            region: "Somewhere",
            country: null,
        });
        expect(splitDeliveryPlace(null)).toEqual({ region: "", country: null });
    });
});

describe("a Global delivery checked against its own country", () => {
    it("asks the US, Canada and Australia for the region from the list and the code", () => {
        expect(checkDeliveryPlace("US", "", "78701")).toEqual({
            problem: "Choose the state.",
            field: "state",
        });
        expect(checkDeliveryPlace("CA", "ON", "")).toEqual({
            problem: "Add the postal code.",
            field: "postalCode",
        });
        expect(checkDeliveryPlace("AU", "Atlantis", "2000")).toMatchObject({
            field: "state",
        });
        expect(checkDeliveryPlace("us", "texas", "787011234")).toEqual({
            region: "TX",
            postcode: "78701-1234",
        });
        expect(checkDeliveryPlace("CA", "on", "k1a0b1")).toEqual({
            region: "ON",
            postcode: "K1A 0B1",
        });
    });

    it("refuses a code that doesn't fit the address's country, with its example", () => {
        expect(checkDeliveryPlace("CA", "ON", "78701")).toEqual({
            problem:
                "A postal code is letter, digit, letter, digit, letter, digit, like K1A 0B1.",
            field: "postalCode",
        });
    });

    it("leaves both optional elsewhere, but checks a typed postcode", () => {
        expect(checkDeliveryPlace("GB", "", "")).toEqual({
            region: "",
            postcode: "",
        });
        expect(checkDeliveryPlace("GB", "Kent", "sw1a1aa")).toEqual({
            region: "Kent",
            postcode: "SW1A 1AA",
        });
        expect(checkDeliveryPlace("GB", "", "78701")).toMatchObject({
            field: "postalCode",
        });
        // A country with no rules takes what was typed.
        expect(checkDeliveryPlace("MY", "Selangor", "40000")).toEqual({
            region: "Selangor",
            postcode: "40000",
        });
    });
});
