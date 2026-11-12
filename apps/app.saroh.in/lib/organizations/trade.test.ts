import { describe, expect, it } from "vitest";

import {
    bookingsPreset,
    galleryTemplateOf,
    tradeLabel,
    tradeOfTemplate,
} from "./trade";

const TEMPLATES = [
    { id: "salon", name: "Salon", kinds: ["salon"] },
    {
        id: "studio",
        name: "Studio",
        slug: "creative-studio",
        kinds: ["creator"],
    },
    { id: "dietician", name: "Dietician", kinds: ["clinic", "coach"] },
];

describe("the kind of place (DEC-216)", () => {
    it("words a stored trade, and none for anything else", () => {
        expect(tradeLabel("gym")).toBe("Gym or studio");
        expect(tradeLabel("creator")).toBe("Creator");
        expect(tradeLabel("SALON")).toBeNull();
        expect(tradeLabel(null)).toBeNull();
    });

    it("gives Bookings' samples to a salon or a gym only (DEC-189)", () => {
        expect(bookingsPreset("salon")).toBe("SALON");
        expect(bookingsPreset("gym")).toBe("GYM");
        expect(bookingsPreset("clinic")).toBeUndefined();
    });

    it("takes a template's first trade a business can pick", () => {
        expect(tradeOfTemplate(["clinic", "coach"])).toBe("clinic");
        expect(tradeOfTemplate(["creator"])).toBeNull();
        expect(tradeOfTemplate(undefined)).toBeNull();
    });

    it("finds the gallery's template by id or slug, and nothing else", () => {
        expect(galleryTemplateOf("salon", TEMPLATES)).toEqual({
            id: "salon",
            name: "Salon",
            trade: "salon",
        });
        expect(galleryTemplateOf(["creative-studio"], TEMPLATES)).toEqual({
            id: "studio",
            name: "Studio",
            trade: null,
        });
        expect(galleryTemplateOf("nope", TEMPLATES)).toBeNull();
        expect(galleryTemplateOf(undefined, TEMPLATES)).toBeNull();
    });
});
