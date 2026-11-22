import { describe, expect, it } from "vitest";

import {
    buttonElementStyleOf,
    colourProblem,
    customColourWords,
    darkenToRead,
    sectionStylesOf,
} from "./element-styles";
import { contrastRatio } from "./palette";
import { parseSectionContent } from "./section-contract";
import { toRendered } from "./to-rendered";

describe("element and section styles (DEC-251, DEC-252)", () => {
    it("takes a role, or a custom colour whose words read at 4.5:1", () => {
        expect(colourProblem("accent")).toBeNull();
        expect(colourProblem("#A65E3F")).toBeNull();
        expect(customColourWords("#A65E3F").words).toBe("light");
        // CS4: yellow keeps its colour with dark words.
        expect(customColourWords("#F2C94C")).toMatchObject({
            words: "dark",
            readable: true,
        });
        // A mid grey reads with neither: refused, with the darker fix.
        expect(colourProblem("#777777")).toMatch(/hard to read/);
        const fix = darkenToRead("#777777");
        expect(contrastRatio("#FFFFFF", fix)).toBeGreaterThanOrEqual(4.5);
        expect(colourProblem(fix)).toBeNull();
        expect(colourProblem("red")).toMatch(/#RRGGBB/);
    });

    it("saves a button's own style and refuses an unreadable one", () => {
        const ok = parseSectionContent("cta", 2, {
            label: "Book",
            action: { kind: "url", href: "/book" },
            style: "soft",
            elementStyle: { colour: "#A65E3F", corners: "pill", size: "l" },
        });
        expect(ok.success).toBe(true);
        expect(ok.success && ok.data).toMatchObject({
            style: "soft",
            elementStyle: { colour: "#A65E3F", corners: "pill", size: "l" },
        });
        const bad = parseSectionContent("cta", 2, {
            label: "Book",
            action: { kind: "url", href: "/book" },
            elementStyle: { colour: "#777777" },
        });
        expect(bad.success).toBe(false);
        const unknown = parseSectionContent("cta", 2, {
            label: "Book",
            action: { kind: "url", href: "/book" },
            elementStyle: { shadow: "big" },
        });
        expect(unknown.success).toBe(false);
    });

    it("keeps a section's styles in its frame, and a photo's corners", () => {
        const result = parseSectionContent("hero", 2, {
            heading: "Hello",
            image: {
                src: "https://example.com/a.jpg",
                elementStyle: { corners: "arch" },
            },
            frame: {
                styles: {
                    button: { corners: "pill", style: "outline" },
                    card: { card: "raised" },
                },
            },
        });
        expect(result.success).toBe(true);
        expect(result.success && result.data).toMatchObject({
            image: { elementStyle: { corners: "arch" } },
            frame: {
                styles: {
                    button: { corners: "pill", style: "outline" },
                    card: { card: "raised" },
                },
            },
        });
        const bad = parseSectionContent("hero", 2, {
            heading: "Hello",
            frame: { styles: { button: { size: "xl" } } },
        });
        expect(bad.success).toBe(false);
    });

    it("reads forgivingly for the renderer", () => {
        expect(sectionStylesOf(undefined)).toBeUndefined();
        expect(sectionStylesOf({ button: {} })).toBeUndefined();
        expect(sectionStylesOf({ image: { corners: "round" } })).toEqual({
            image: { corners: "round" },
        });
        expect(
            buttonElementStyleOf({ colour: "#777777", corners: "pill" }),
        ).toEqual({ corners: "pill" });
    });

    it("rides into the publish snapshot with the button's resolved link", () => {
        const draft = parseSectionContent("hero", 2, {
            heading: "Hello",
            cta: {
                label: "Book",
                action: { kind: "page", pageId: "p1" },
                elementStyle: { corners: "pill" },
            },
            frame: { styles: { image: { corners: "round" } } },
        });
        expect(draft.success).toBe(true);
        const rendered = toRendered("hero", draft.success && draft.data, {
            resolvePage: () => "/book",
        });
        expect(rendered).toMatchObject({
            cta: { href: "/book", elementStyle: { corners: "pill" } },
            frame: { styles: { image: { corners: "round" } } },
        });
    });
});
