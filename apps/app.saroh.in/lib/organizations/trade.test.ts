import { describe, expect, it } from "vitest";

import {
    bookingsPreset,
    galleryTemplateOf,
    tradeLabel,
    tradeOfTemplate,
    tradeOtherProblem,
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

    it("words Other as the trade typed beside it (12 Nov 2026)", () => {
        expect(tradeLabel("other", " Bakery ")).toBe("Bakery");
        expect(tradeLabel("other", null)).toBe("Other");
        expect(tradeLabel("shop", "Bakery")).toBe("Shop");
    });

    it("needs Other's trade in words, 2 to 60 characters", () => {
        expect(tradeOtherProblem("other", "")).toBe("Say what your trade is.");
        expect(tradeOtherProblem("other", " B ")).toBe(
            "Use at least 2 characters.",
        );
        expect(tradeOtherProblem("other", "x".repeat(61))).toBe(
            "Keep it to 60 characters.",
        );
        expect(tradeOtherProblem("other", "Tailor")).toBeNull();
        expect(tradeOtherProblem("shop", "")).toBeNull();
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
