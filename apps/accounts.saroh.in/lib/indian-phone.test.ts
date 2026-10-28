import { describe, expect, it } from "vitest";

import {
    billingPhoneProblem,
    NO_PHONE,
    NOT_A_MOBILE,
    NOT_INDIAN,
    signInPhoneProblem,
} from "./indian-phone";

describe("signInPhoneProblem", () => {
    it.each(["+919845012345", "+916000000000", "+917012345678"])(
        "takes the Indian mobile %s",
        (phone) => expect(signInPhoneProblem(phone)).toBe(null),
    );
    it("asks for a number when there is none", () => {
        expect(signInPhoneProblem("")).toBe(NO_PHONE);
    });
    it.each(["+912245678901", "+911234567890", "+442079460958"])(
        "refuses %s: not an Indian mobile",
        (phone) => expect(signInPhoneProblem(phone)).toBe(NOT_A_MOBILE),
    );
    it("says what is wrong with a short number", () => {
        expect(signInPhoneProblem("+9198450")).not.toBe(null);
    });
});

describe("billingPhoneProblem", () => {
    it("is optional", () => expect(billingPhoneProblem("")).toBe(null));
    it.each(["+919845012345", "+912245678901", "+911234567890"])(
        "takes the Indian number %s",
        (phone) => expect(billingPhoneProblem(phone)).toBe(null),
    );
    it("refuses a foreign number in the API's words", () => {
        expect(billingPhoneProblem("+442079460958")).toBe(NOT_INDIAN);
    });
});
