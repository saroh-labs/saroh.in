import { describe, expect, it } from "vitest";

import {
    addressDraftOf,
    addressPatch,
    mapLinkFieldValue,
    mapLinkProblem,
    readMapLink,
} from "./location-address";

const SAVED = {
    address: "12 Hill Road\nBandra",
    mapUrl: "https://maps.app.goo.gl/AbC123xyZ",
};

describe("a location's address and Google Maps link (DEC-128)", () => {
    it("starts from what is saved, the link without its https", () => {
        expect(addressDraftOf(SAVED)).toEqual({
            address: "12 Hill Road\nBandra",
            mapUrl: "maps.app.goo.gl/AbC123xyZ",
        });
        expect(addressDraftOf({ address: null })).toEqual({
            address: "",
            mapUrl: "",
        });
        expect(mapLinkFieldValue("https://www.google.com/maps/place/Rye")).toBe(
            "google.com/maps/place/Rye",
        );
    });

    it("says where Get directions will open", () => {
        expect(readMapLink("  ")).toEqual({ kind: "empty" });
        expect(readMapLink("g.page/rye-bakery")).toEqual({
            kind: "opens",
            url: "https://g.page/rye-bakery",
            shown: "g.page/rye-bakery",
        });
        const long = readMapLink(
            `https://www.google.com/maps/place/${"a".repeat(80)}`,
        );
        expect(long.kind === "opens" && long.shown).toHaveLength(58);
    });

    it("refuses anything that isn't a Google Maps link", () => {
        for (const bad of [
            "https://evil.example/maps",
            "https://www.google.com/url?q=https://evil.example",
            "12 Hill Road",
        ]) {
            expect(mapLinkProblem(bad)).toBe(
                "That isn't a Google Maps link. In Google Maps, press Share and paste the link here.",
            );
        }
        expect(mapLinkProblem("")).toBeNull();
        expect(mapLinkProblem("maps.app.goo.gl/AbC123xyZ")).toBeNull();
    });
});

describe("what Save sends", () => {
    it("is nothing for an untouched sheet", () => {
        expect(addressPatch(addressDraftOf(SAVED), SAVED)).toEqual({});
        expect(
            addressPatch(
                {
                    address: " 12 Hill Road\nBandra ",
                    mapUrl: "https://maps.app.goo.gl/AbC123xyZ",
                },
                SAVED,
            ),
        ).toEqual({});
    });

    it("is only what changed", () => {
        expect(
            addressPatch(
                { ...addressDraftOf(SAVED), address: "7 Linking Road" },
                SAVED,
            ),
        ).toEqual({ address: "7 Linking Road" });
        expect(
            addressPatch(
                { ...addressDraftOf(SAVED), mapUrl: " g.page/rye-bakery " },
                SAVED,
            ),
        ).toEqual({ mapUrl: "g.page/rye-bakery" });
    });

    it("clears an emptied address or link with null", () => {
        expect(addressPatch({ address: " ", mapUrl: "" }, SAVED)).toEqual({
            address: null,
            mapUrl: null,
        });
    });

    it("adds a link where there was none", () => {
        expect(
            addressPatch(
                { address: "12 Hill Road", mapUrl: "g.page/rye-bakery" },
                { address: "12 Hill Road" },
            ),
        ).toEqual({ mapUrl: "g.page/rye-bakery" });
    });
});
