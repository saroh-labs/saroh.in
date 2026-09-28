import { BadRequestException } from "@nestjs/common";

import type { ContactAddress } from "./contact-address";
import {
    changedAddressFields,
    isEmptyAddress,
    nextAddress,
    touchesAddress,
} from "./contact-address";

/**
 * A contact's postal address (C8): checked as a whole, India's state from
 * the GST list and its PIN six digits.
 */

const NONE: ContactAddress = {
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
};

function refusal(fn: () => unknown): { message: string; field: string } {
    try {
        fn();
    } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
            message: string;
            details: { field: string };
        };
        return { message: body.message, field: body.details.field };
    }
    throw new Error("expected a refusal");
}

describe("nextAddress", () => {
    it("stores an Indian address with the state's name and a bare PIN", () => {
        expect(
            nextAddress(NONE, {
                addressLine1: " 12 Hill Road ",
                city: "Bengaluru",
                state: "29",
                postalCode: "560 038",
                country: "in",
            }),
        ).toEqual({
            addressLine1: "12 Hill Road",
            addressLine2: null,
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560038",
            country: "IN",
        });
    });

    it("reads a state typed by name", () => {
        expect(
            nextAddress(NONE, {
                addressLine1: "1 MG Road",
                state: "tamil nadu",
                country: "IN",
            }).state,
        ).toBe("Tamil Nadu");
    });

    it("refuses a PIN of four digits in India, with a sentence", () => {
        expect(
            refusal(() =>
                nextAddress(NONE, {
                    addressLine1: "12 Hill Road",
                    postalCode: "5600",
                    country: "IN",
                }),
            ),
        ).toEqual({
            message: "A PIN code is six digits, like 560038.",
            field: "postalCode",
        });
    });

    it("refuses a state that isn't on the GST list in India", () => {
        expect(
            refusal(() =>
                nextAddress(NONE, {
                    addressLine1: "12 Hill Road",
                    state: "Atlantis",
                    country: "IN",
                }),
            ).field,
        ).toBe("state");
    });

    it("leaves another country's state and postcode as typed", () => {
        expect(
            nextAddress(NONE, {
                addressLine1: "221B Baker Street",
                city: "London",
                state: "Greater London",
                postalCode: "NW1 6XE",
                country: "GB",
            }),
        ).toMatchObject({ state: "Greater London", postalCode: "NW1 6XE" });
    });

    it("re-checks the PIN already held when the country becomes India", () => {
        const abroad = nextAddress(NONE, {
            addressLine1: "1 Main St",
            postalCode: "1234",
            country: "US",
        });
        expect(
            refusal(() => nextAddress(abroad, { country: "IN" })).field,
        ).toBe("postalCode");
    });

    it("refuses a country that isn't a two-letter code", () => {
        expect(
            refusal(() =>
                nextAddress(NONE, { addressLine1: "x", country: "I1" }),
            ).field,
        ).toBe("country");
    });

    it("clears a field sent as blank, and keeps the ones not sent", () => {
        const held = nextAddress(NONE, {
            addressLine1: "12 Hill Road",
            addressLine2: "Flat 4",
            city: "Bengaluru",
            country: "IN",
        });
        expect(nextAddress(held, { addressLine2: "" })).toMatchObject({
            addressLine1: "12 Hill Road",
            addressLine2: null,
            city: "Bengaluru",
        });
    });

    it("reads a country alone as no address", () => {
        expect(nextAddress(NONE, { country: "IN" })).toEqual(NONE);
        const held = nextAddress(NONE, {
            addressLine1: "12 Hill Road",
            country: "IN",
        });
        expect(nextAddress(held, { addressLine1: "" })).toEqual(NONE);
    });
});

describe("the address helpers", () => {
    it("knows when a patch names the address", () => {
        expect(touchesAddress({})).toBe(false);
        expect(touchesAddress({ city: "" })).toBe(true);
    });

    it("reads only a country as empty", () => {
        expect(isEmptyAddress({ ...NONE, country: "IN" })).toBe(true);
        expect(isEmptyAddress({ ...NONE, city: "Pune" })).toBe(false);
    });

    it("names the fields whose stored value changes", () => {
        expect(changedAddressFields(NONE, { ...NONE, city: "Pune" })).toEqual([
            "city",
        ]);
    });
});
