import { describe, expect, it } from "vitest";

import { phoneText } from "./phone";

describe("phoneText (DEC-053)", () => {
    it("groups an Indian number as it is usually written", () => {
        expect(phoneText("+918040992210")).toBe("+91 80409 92210");
        expect(phoneText("+919845012345")).toBe("+91 98450 12345");
    });

    it("leaves any other country's number as it came", () => {
        expect(phoneText("+14155550100")).toBe("+14155550100");
    });

    it("leaves a number already written with spaces alone", () => {
        expect(phoneText("+91 22 4000 0000")).toBe("+91 22 4000 0000");
    });
});
