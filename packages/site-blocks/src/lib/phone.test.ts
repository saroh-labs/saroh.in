import { describe, expect, it } from "vitest";

import { phoneText } from "./phone";

describe("phoneText (DEC-053)", () => {
    it("groups an Indian number as it is usually written", () => {
        expect(phoneText("+918040992210")).toBe("+91 80409 92210");
        expect(phoneText("+919845012345")).toBe("+91 98450 12345");
    });

    it("groups any other country's number after its code (#1036)", () => {
        expect(phoneText("+14155550100")).toBe("+1 415 555 0100");
        expect(phoneText("+971501234567")).toBe("+971 50 123 4567");
    });

    it("reads a number written with spaces the same way", () => {
        expect(phoneText("+91 98450 12345")).toBe("+91 98450 12345");
    });

    it("leaves what isn't a number as it came", () => {
        expect(phoneText("Ask at the desk")).toBe("Ask at the desk");
    });
});
