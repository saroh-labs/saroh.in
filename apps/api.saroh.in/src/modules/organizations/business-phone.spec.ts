import { BadRequestException } from "@nestjs/common";
import { joinPhone, PHONE_CASES, splitPhone } from "@saroh/block-contract";

import {
    normalisePublicPhone,
    phoneWrite,
    publicPhone,
} from "./business-phone";

describe("the business's public phone (DEC-053, F20)", () => {
    describe("normalisePublicPhone", () => {
        it.each([
            ["+919845012345", "+919845012345"],
            ["+91 98450 12345", "+919845012345"],
            [" +91-98450-12345 ", "+919845012345"],
            ["+91 (80) 4000.1234", "+918040001234"],
            ["+44 113 496 0000", "+441134960000"],
            ["+1 415 555 0100", "+14155550100"],
        ])("keeps %j as %j", (typed, stored) => {
            expect(normalisePublicPhone(typed)).toEqual({ phone: stored });
        });

        it("clears to null on an empty or blank value", () => {
            expect(normalisePublicPhone("")).toEqual({ phone: null });
            expect(normalisePublicPhone("   ")).toEqual({ phone: null });
        });

        it.each([
            ["98450 12345", "+919845012345"],
            ["098450 12345", "+919845012345"],
            ["91 98450 12345", "+919845012345"],
            ["0091 98450 12345", "+919845012345"],
            ["080 4000 1234", "+918040001234"],
        ])(
            "reads %j, typed without the +, as an Indian number",
            (typed, stored) => {
                expect(normalisePublicPhone(typed)).toEqual({ phone: stored });
            },
        );

        it("asks for the country code when there is no + and it isn't an Indian number", () => {
            expect(normalisePublicPhone("1 415 555 0100")).toEqual({
                problem: expect.stringContaining("country code"),
            });
            expect(normalisePublicPhone("98450 1234")).toHaveProperty(
                "problem",
            );
        });

        it.each([
            "+0 1234 5678", // no country code starts with 0
            "+91", // a code and nothing else
            "+1234567", // 7 digits: too short
            "+1234567890123456", // 16 digits: too long
            "+91 98450 1234x", // a letter
            "+91 98450 +12345", // a second +
            "tel:+919845012345",
        ])("refuses %j", (typed) => {
            expect(normalisePublicPhone(typed)).toHaveProperty("problem");
        });

        it("wants ten digits after +91", () => {
            expect(normalisePublicPhone("+91 98450 1234")).toEqual({
                problem: "An Indian number is +91 and then 10 digits.",
            });
            expect(normalisePublicPhone("+91 98450 123456")).toHaveProperty(
                "problem",
            );
        });
    });

    describe("phoneWrite", () => {
        it("writes nothing when the save does not send it", () => {
            expect(phoneWrite(undefined)).toEqual({});
        });

        it("clears with an empty string", () => {
            expect(phoneWrite("")).toEqual({ phone: null });
        });

        it("refuses on the phone field", () => {
            let caught: unknown;
            try {
                phoneWrite("12345");
            } catch (e) {
                caught = e;
            }
            expect(caught).toBeInstanceOf(BadRequestException);
            expect((caught as BadRequestException).getResponse()).toEqual(
                expect.objectContaining({ details: { field: "phone" } }),
            );
        });
    });

    describe("publicPhone", () => {
        it("serves a stored E.164 number", () => {
            expect(publicPhone("+919845012345")).toBe("+919845012345");
        });

        it("never serves an empty or malformed value", () => {
            expect(publicPhone(null)).toBeNull();
            expect(publicPhone(undefined)).toBeNull();
            expect(publicPhone("")).toBeNull();
            expect(publicPhone("98450 12345")).toBeNull();
            expect(publicPhone("+91 98450 12345")).toBeNull();
        });
    });
});

/**
 * #1036: the workspace's and the site's phone fields send what
 * `joinPhone(splitPhone(typed))` gives. Each shared case must mean the same
 * here as there: kept as the same E.164, or refused by both.
 */
describe("the API's rule and the phone fields agree (#1036)", () => {
    it.each(PHONE_CASES)("$typed", ({ typed, stored }) => {
        const api = normalisePublicPhone(typed);
        const field = normalisePublicPhone(joinPhone(splitPhone(typed, "IN")));
        if (stored) {
            expect(api).toEqual({ phone: stored });
            expect(field).toEqual({ phone: stored });
        } else {
            expect(api).toHaveProperty("problem");
            expect(field).toHaveProperty("problem");
        }
    });

    it("keeps every stored E.164 number as it is", () => {
        for (const { stored } of PHONE_CASES) {
            if (stored)
                expect(normalisePublicPhone(stored)).toEqual({ phone: stored });
        }
    });
});
