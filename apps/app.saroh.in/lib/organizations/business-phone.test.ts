import { describe, expect, it } from "vitest";

import { phoneLabel, phoneProblem } from "./business-phone";

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

    it("asks for the country code when there is no +", () => {
        expect(phoneProblem("98450 12345")).toMatch(/country code/);
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

    it("reads an Indian number in groups, any other as stored", () => {
        expect(phoneLabel("+919845012345")).toBe("+91 98450 12345");
        expect(phoneLabel("+441134960000")).toBe("+441134960000");
        expect(phoneLabel(null)).toBe("");
        expect(phoneLabel(undefined)).toBe("");
    });
});
