import { describe, expect, it } from "vitest";

import { emailed, reachOrNull, toldText } from "./told";

describe("what a confirmation says happens next", () => {
    it("says an email went only when one does, to the address it went to", () => {
        expect(toldText("EMAIL", "asha@example.com")).toBe(
            "We've emailed asha@example.com.",
        );
        expect(toldText("EMAIL_AND_ACCOUNT", " asha@example.com ")).toBe(
            "We've emailed asha@example.com.",
        );
    });

    it("says where it is kept otherwise, and never promises an email", () => {
        for (const reach of [
            "ACCOUNT",
            "ON_SIGN_IN",
            "NONE",
            null,
            undefined,
        ] as const) {
            expect(toldText(reach, "asha@example.com")).toBe(
                "It's saved in your account.",
            );
        }
        // An email goes, but the page doesn't know where: it names none.
        expect(toldText("EMAIL", null)).toBe("It's saved in your account.");
        expect(toldText("EMAIL", " ")).toBe("It's saved in your account.");
    });

    it("reads only a reach it knows", () => {
        expect(reachOrNull("EMAIL")).toBe("EMAIL");
        expect(reachOrNull("SMS")).toBeNull();
        expect(reachOrNull(undefined)).toBeNull();
        expect(emailed("ACCOUNT")).toBe(false);
        expect(emailed("EMAIL_AND_ACCOUNT")).toBe(true);
    });
});
