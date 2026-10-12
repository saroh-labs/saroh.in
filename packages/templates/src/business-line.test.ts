import { describe, expect, it } from "vitest";

import {
    BUSINESS_LINE_MAX,
    businessArea,
    composeBusinessLine,
} from "./business-line";
import { isOwnerNote, templatePlaceholderIn } from "./placeholders";

describe("composeBusinessLine", () => {
    it("joins the business's own names and its town", () => {
        expect(
            composeBusinessLine({
                offers: ["Haircut", "Colour", "Bridal styling"],
                area: "Bengaluru",
            }),
        ).toBe("Haircut, Colour and Bridal styling in Bengaluru");
    });

    it.each([
        [["Consultation"], "Consultation"],
        [["Breads", "Cakes"], "Breads and Cakes"],
        [["Breads", "Cakes", "Cookies"], "Breads, Cakes and Cookies"],
    ])("lists %j as %s", (offers, line) => {
        expect(composeBusinessLine({ offers })).toBe(line);
    });

    it("says 'and more' past three, and never names a fourth", () => {
        expect(
            composeBusinessLine({
                offers: ["Cut", "Colour", "Shave", "Facial", "Massage"],
                area: "Pune",
            }),
        ).toBe("Cut, Colour, Shave and more in Pune");
    });

    it("keeps each name exactly as the owner wrote it", () => {
        expect(
            composeBusinessLine({ offers: ["Thai massage", "iPhone repair"] }),
        ).toBe("Thai massage and iPhone repair");
    });

    it("tidies spacing, drops blanks and names a thing once", () => {
        expect(
            composeBusinessLine({
                offers: ["  Hair   cut ", "", null, undefined, "hair cut"],
            }),
        ).toBe("Hair cut");
    });

    it("leaves out a name that is really a sentence", () => {
        expect(
            composeBusinessLine({
                offers: [
                    "A ninety minute deep tissue massage with hot stones and oils",
                    "Facial",
                ],
            }),
        ).toBe("Facial");
    });

    it.each([
        ["nothing named", {}],
        ["an empty list", { offers: [] }],
        ["only blanks", { offers: ["", "   "] }],
        ["a town alone", { offers: [], area: "Bengaluru" }],
    ])("says nothing for %s", (_label, facts) => {
        expect(composeBusinessLine(facts)).toBeUndefined();
    });

    it("drops names before it runs long, and keeps the town", () => {
        const offers = [
            "Deep tissue massage for runners",
            "Sports injury rehabilitation",
            "Prenatal and postnatal massage",
        ];
        const line = composeBusinessLine({
            offers,
            area: "Thiruvananthapuram",
        });
        expect(line).toBeDefined();
        expect(line?.length).toBeLessThanOrEqual(BUSINESS_LINE_MAX);
        expect(line).toContain("in Thiruvananthapuram");
        expect(line).toContain("and more");
    });

    it("is never a note to the owner or a template's placeholder", () => {
        const line = composeBusinessLine({
            offers: ["Haircut", "Colour"],
            area: "Bengaluru",
        });
        expect(isOwnerNote(line)).toBe(false);
        expect(templatePlaceholderIn(line ?? "")).toBeNull();
    });
});

describe("businessArea", () => {
    it("is the town, tidied", () => {
        expect(businessArea("  New   Delhi ")).toBe("New Delhi");
    });

    it.each([
        ["nothing", null],
        ["a blank", "  "],
        ["a postcode", "560038"],
        ["an address typed into the town", "12 MG Road, Bengaluru"],
        [
            "something far too long to be a town",
            "The second floor above the bakery near the old bus stand",
        ],
    ])("is not said for %s", (_label, value) => {
        expect(businessArea(value)).toBeNull();
    });
});
