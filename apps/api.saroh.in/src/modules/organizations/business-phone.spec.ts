import { BadRequestException } from "@nestjs/common";

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

        it("asks for the country code when there is no +", () => {
            const r = normalisePublicPhone("98450 12345");
            expect(r).toEqual({
                problem: expect.stringContaining("country code"),
            });
            expect(normalisePublicPhone("0091 98450 12345")).toHaveProperty(
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
