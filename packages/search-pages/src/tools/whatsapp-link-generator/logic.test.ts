import { describe, expect, it } from "vitest";

import { readMobile, showMobile, waLink } from "./logic";

describe("WhatsApp link", () => {
    it("makes the boards' link to the letter", () => {
        expect(
            waLink("9999999999", "Hi, I'd like to book a haircut this week."),
        ).toBe(
            "https://wa.me/919999999999?text=Hi%2C%20I'd%20like%20to%20book%20a%20haircut%20this%20week.",
        );
    });

    it("leaves the message out when there is none, and the number when there isn't one", () => {
        expect(waLink("9999999999", "  ")).toBe("https://wa.me/919999999999");
        expect(waLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
    });

    it("reads Indian mobile numbers however they're typed", () => {
        for (const v of [
            "99999 99999",
            "+91 99999-99999",
            "919999999999",
            "09999999999",
        ])
            expect(readMobile(v)).toEqual({ at: "ok", digits: "9999999999" });
        expect(readMobile("")).toEqual({ at: "empty" });
        expect(showMobile("9999999999")).toBe("+91 99999 99999");
    });

    it("says what's wrong with a number, as the States board does", () => {
        expect(readMobile("99999 9999")).toEqual({
            at: "bad",
            problem:
                "A mobile number here has 10 digits and starts with 6, 7, 8 or 9. This one has 9.",
        });
        const r = readMobile("55555 55555");
        expect(r.at === "bad" && r.problem).toMatch(
            /This one starts with 5\.$/,
        );
    });
});
