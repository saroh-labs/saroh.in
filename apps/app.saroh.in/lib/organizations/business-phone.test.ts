import { describe, expect, it } from "vitest";

import { phoneLabel, phoneProblem, phoneStored } from "./business-phone";

describe("the business's public phone (DEC-053)", () => {
    it.each([
        "",
        "   ",
        "+919845012345",
        "+91 98450 12345",
        "+91-98450-12345",
        "+91 (80) 4000 1234",
        "+44 113 496 0000",
    ])("accepts %j", (typed) => {
        expect(phoneProblem(typed)).toBeNull();
    });

    it.each([
        ["98450 12345", "+919845012345"],
        ["098450 12345", "+919845012345"],
        ["91 98450 12345", "+919845012345"],
    ])("takes %j, typed without the +, as Indian", (typed, stored) => {
        expect(phoneProblem(typed)).toBeNull();
        expect(phoneStored(typed)).toBe(stored);
    });

    it("asks for the country code when there is no + and it isn't Indian", () => {
        expect(phoneProblem("1 415 555 0100")).toMatch(/country code/);
    });

    it.each(["+0 1234 5678", "+1234567", "+1234567890123456", "+91 9845x"])(
        "refuses %j",
        (typed) => {
            expect(phoneProblem(typed)).not.toBeNull();
        },
    );

    it("wants ten digits after +91", () => {
        expect(phoneProblem("+91 98450 1234")).toBe(
            "An Indian number is +91 and then 10 digits.",
        );
    });

    it("reads a saved number in groups (#1036)", () => {
        expect(phoneLabel("+919845012345")).toBe("+91 98450 12345");
        expect(phoneLabel("+441134960000")).toBe("+44 113 496 0000");
        expect(phoneLabel(null)).toBe("");
        expect(phoneLabel(undefined)).toBe("");
    });
});
