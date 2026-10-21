// DEC-177: what admin can mark free, and the ids publishing refuses.
import { freeStyleChoices, unknownFreeStyles } from "./free-style-choices";

describe("freeStyleChoices", () => {
    const choices = freeStyleChoices();

    it("offers the three looks, and every pair but the system font", () => {
        expect(choices.looks.map((l) => l.id)).toEqual([
            "folio",
            "quiet",
            "live",
        ]);
        const pairs = choices.fontPairs.map((p) => p.id);
        expect(pairs).not.toContain("system");
        // A look's own pair comes with the look and isn't offered alone.
        expect(pairs).not.toContain("folio");
        expect(pairs).toContain("archivo");
    });

    it("names each colourway with its template, once", () => {
        const ids = choices.colourways.map((c) => c.id);
        expect(ids).toContain("salon:kesar");
        expect(ids).toContain("starter:clay");
        expect(ids).toContain("dietician:clay");
        expect(new Set(ids).size).toBe(ids.length);
        expect(choices.colourways.find((c) => c.id === "salon:kesar")).toEqual(
            expect.objectContaining({ name: "Kesar" }),
        );
    });
});

describe("unknownFreeStyles", () => {
    it("names the ids this build has nothing for", () => {
        expect(
            unknownFreeStyles({
                freeStyles: {
                    looks: ["quiet", "bold"],
                    fontPairs: ["system", "archivo", "comic"],
                    colourways: ["salon:kesar", "salon:neon"],
                },
            }),
        ).toEqual(["bold", "comic", "salon:neon"]);
        expect(unknownFreeStyles({})).toEqual([]);
    });
});
