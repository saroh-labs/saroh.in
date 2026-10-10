/**
 * An address's Google Maps link as a save writes it and a read serves it
 * (DEC-125): Google's own map pages only, as one address each. DB-free.
 */
import { mapLinkRead, mapLinkWrite } from "./map-link";

describe("mapLinkWrite", () => {
    it("leaves it alone when nothing was sent", () => {
        expect(mapLinkWrite(undefined)).toEqual({ leave: true });
    });

    it("clears it with an empty value", () => {
        expect(mapLinkWrite("")).toEqual({ url: null });
        expect(mapLinkWrite("   ")).toEqual({ url: null });
        expect(mapLinkWrite(null)).toEqual({ url: null });
    });

    it("keeps a Google Maps link as one address on Google's own host", () => {
        expect(mapLinkWrite(" maps.app.goo.gl/AbC123xyZ ")).toEqual({
            url: "https://maps.app.goo.gl/AbC123xyZ",
        });
        expect(
            mapLinkWrite("https://www.google.co.in/maps/place/Rye+Bakery"),
        ).toEqual({ url: "https://www.google.com/maps/place/Rye+Bakery" });
        expect(mapLinkWrite("g.page/rye-bakery")).toEqual({
            url: "https://g.page/rye-bakery",
        });
    });

    it("refuses anything else, without repeating it", () => {
        for (const bad of [
            "https://evil.example/maps",
            "javascript:alert(1)",
            "https://www.google.com/url?q=https://evil.example",
            "14 Hill Road",
        ]) {
            const refused = mapLinkWrite(bad);
            expect(refused).toEqual({
                problem:
                    "That isn't a Google Maps link. In Google Maps, press Share and paste the link here.",
            });
        }
    });
});

describe("mapLinkRead", () => {
    it("serves only a stored value that is already canonical", () => {
        expect(mapLinkRead("https://g.page/rye-bakery")).toBe(
            "https://g.page/rye-bakery",
        );
        expect(mapLinkRead("https://evil.example/maps")).toBeNull();
        expect(mapLinkRead("g.page/rye-bakery")).toBeNull();
        expect(mapLinkRead(null)).toBeNull();
        expect(mapLinkRead(undefined)).toBeNull();
    });
});
