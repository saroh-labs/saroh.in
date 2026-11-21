import { sectionWords, withWords } from "./section-words";

describe("a section's words (edit_section)", () => {
    const hero = {
        variant: "centered",
        heading: "Packaging, storage and safety supplies",
        subheading: "Cartons, tape and crates.",
        cta: { label: "Browse", action: { kind: "url", href: "/products" } },
    };

    it("reads the heading, the line under it and the button's label where the type keeps them", () => {
        expect(sectionWords(hero)).toEqual({
            heading: hero.heading,
            subheading: hero.subheading,
            button_label: "Browse",
        });
        // A Big button section keeps its words on the button itself.
        expect(
            sectionWords({ label: "Open a trade account", action: {} }),
        ).toEqual({ button_label: "Open a trade account" });
    });

    it("sets only those words and leaves the rest, and names a field the section hasn't", () => {
        const next = withWords(hero, {
            heading: "Packaging that arrives whole",
            button_label: "See the catalogue",
        });
        expect(next.missing).toEqual([]);
        expect(next.content).toEqual({
            ...hero,
            heading: "Packaging that arrives whole",
            cta: { ...hero.cta, label: "See the catalogue" },
        });
        // The original is never changed in place.
        expect(hero.heading).toBe("Packaging, storage and safety supplies");
        expect(
            withWords({ value: "<p>Hi</p>" }, { heading: "x" }).missing,
        ).toEqual(["heading"]);
    });
});
