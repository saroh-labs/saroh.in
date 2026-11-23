import { readFileSync } from "node:fs";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CtaButton, ctaClasses } from "./blocks/cta";
import { FrontCta } from "./blocks/look-front";
import { componentRules, sectionStyleRules } from "./component-theme";
import { buttonInlineStyle, colourPair, elementProps } from "./element-theme";
import { PageSections } from "./section-renderer";

/**
 * Element and section styles (DEC-253, DEC-254): what wins, closest
 * first, and nothing at all for a page nobody styled.
 */
describe("one element's own style", () => {
    it("writes nothing for a button with none, live or on a look", () => {
        const { container } = render(
            <>
                <CtaButton content={{ label: "Book", href: "/book" }} />
                <FrontCta
                    content={{ label: "Book", href: "/book" }}
                    look="quiet"
                />
            </>,
        );
        for (const a of Array.from(container.querySelectorAll("a"))) {
            expect(a.hasAttribute("style")).toBe(false);
            expect(a.hasAttribute("data-site-el")).toBe(false);
        }
    });

    it("draws its corners, size and colour inline, so it beats the section", () => {
        const { container } = render(
            <CtaButton
                content={{
                    label: "Book",
                    href: "/book",
                    elementStyle: {
                        corners: "pill",
                        size: "l",
                        colour: "#F2C94C",
                    },
                }}
            />,
        );
        const a = container.querySelector("a");
        if (!a) throw new Error("no button drawn");
        expect(a.style.borderRadius).toBe("999px");
        expect(a.style.fontSize).toBe("1rem");
        // CS4: yellow keeps its colour with dark words.
        expect(a.style.color).toBe("rgb(28, 26, 24)");
    });

    it("colours by style: outline its edge, soft a tint, link its underline", () => {
        expect(buttonInlineStyle("secondary", { colour: "accent" })).toEqual({
            borderColor: "hsl(var(--site-accent))",
        });
        expect(buttonInlineStyle("soft", { colour: "fg" })).toEqual({
            backgroundColor:
                "color-mix(in srgb, hsl(var(--site-fg)) 16%, transparent)",
        });
        expect(buttonInlineStyle("link", { size: "l" })).toBeUndefined();
        // An unreadable custom colour never reaches CSS.
        expect(buttonInlineStyle("primary", { colour: "#777777" })).toBe(
            undefined,
        );
        expect(colourPair("url(x)")).toBeNull();
    });

    it("draws Soft as a tint with the page's words", () => {
        expect(ctaClasses("soft")).toContain("bg-site-accent/15");
        expect(ctaClasses("soft")).toContain("coarse:min-h-11");
    });

    it("is marked for the editor only when the canvas stamps it", () => {
        expect(elementProps("image", { editorPath: "image" })).toEqual({
            "data-site-el": "image:image",
        });
        expect(elementProps("image", {})).toEqual({});
    });
});

describe("one section's styles", () => {
    const hero = (frame?: unknown) => ({
        type: "hero",
        content: {
            heading: "Hello",
            cta: { label: "Book", href: "/book" },
            ...(frame ? { frame } : {}),
        },
    });

    it("adds no mark and no sheet to a section with none", () => {
        const { container } = render(<PageSections sections={[hero()]} />);
        expect(container.querySelector("[data-site-styled]")).toBeNull();
        expect(container.querySelector("style")).toBeNull();
    });

    it("writes its rules once, after the sections, under its own mark", () => {
        const frame = { styles: { button: { corners: "pill" } } };
        const { container } = render(
            <PageSections sections={[hero(frame), hero(frame), hero()]} />,
        );
        const marked = container.querySelectorAll("[data-site-styled]");
        expect(marked).toHaveLength(2);
        const mark = marked[0].getAttribute("data-site-styled");
        expect(marked[1].getAttribute("data-site-styled")).toBe(mark);
        const sheets = container.querySelectorAll("style");
        expect(sheets).toHaveLength(1);
        expect(container.lastElementChild?.tagName).toBe("STYLE");
        expect(sheets[0].textContent).toContain(
            `[data-site-styled="${mark}"][data-site-styled="${mark}"]`,
        );
        expect(sheets[0].textContent).toContain("--site-button-radius: 999px");
    });

    it("writes each choice it names", () => {
        const css = sectionStyleRules(".s", undefined, {
            button: { colour: "#A65E3F", style: "outline", size: "s" },
            card: { card: "raised", corners: "rounded" },
            image: { corners: "arch" },
        });
        expect(css).toContain("--site-button-fill: #A65E3F");
        expect(css).toContain("--site-button-tint: 0%");
        expect(css).toContain("border-width: 1px");
        expect(css).toContain("padding: 0.5rem 1rem");
        expect(css).toContain("--site-card-radius: 20px");
        expect(css).toContain("--site-image-radius: 999px 999px 0 0");
        expect(sectionStyleRules(".s", "quiet", {})).toBe("");
    });
});

describe("the template locks are gone (DEC-255)", () => {
    // Each fixed radius now reads the shared variable, with today's value
    // as its fallback, so an untouched site draws as it did.
    const read = (file: string) =>
        readFileSync(new URL(file, import.meta.url), "utf8");

    it.each([
        [
            "./blocks/timetable-look.tsx",
            "rounded-[var(--site-card-radius,20px)]",
        ],
        ["./blocks/timetable-look.tsx", "rounded-[var(--site-tag-radius,9px)]"],
        ["./blocks/prices-look.tsx", "rounded-[var(--site-tag-radius,9px)]"],
        ["./blocks/timetable.tsx", "rounded-[var(--site-tag-radius,4px)]"],
        [
            "./blocks/services-look.tsx",
            "rounded-[var(--site-card-radius,14px)]",
        ],
        [
            "./blocks/person-look.tsx",
            "rounded-[var(--site-image-radius,9999px)]",
        ],
        [
            "./blocks/hero-look.tsx",
            "max-[699px]:rounded-[var(--site-image-radius,0px)]",
        ],
    ])("%s reads %s", (file, token) => {
        expect(read(file)).toContain(token);
    });

    it("draws Live's header button as a button, not a tag", () => {
        const source = read("./look-header-parts.tsx");
        expect(source).toContain('live: "rounded-site border-[1.5px]');
        expect(source).not.toContain('live: "rounded-full border-[1.5px]');
    });

    it("leaves no fixed badge or card radius behind", () => {
        for (const file of [
            "./blocks/timetable-look.tsx",
            "./blocks/services-look.tsx",
            "./blocks/prices-look.tsx",
            "./blocks/timetable-today.tsx",
            "./live/next-free.tsx",
        ]) {
            expect(read(file)).not.toMatch(/rounded-\[(4|9|14|20)px\]/);
        }
    });
});

describe("closest choice wins, per property (DEC-253)", () => {
    const siteRules = (choices: Record<string, string>) =>
        componentRules(
            ":root",
            undefined,
            Object.fromEntries(
                Object.entries(choices).map(([k, v]) => [
                    `--site-choice-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
                    v,
                ]),
            ),
        );

    it("a section's colour keeps the site's Outline", () => {
        const site = siteRules({ buttonStyle: "outline" });
        expect(site).toContain("--site-button-tint: 0%");
        const section = sectionStyleRules(".s", undefined, {
            button: { colour: "fg" },
        });
        // The section names a colour only: no fill of its own, the paint
        // reads the tint the site's style set.
        expect(section).not.toContain(
            "background-color: var(--site-button-fill)",
        );
        expect(section).not.toContain("--site-button-tint:");
        expect(section).toContain("var(--site-button-tint, 100%)");
        expect(section).toContain("--site-button-fill: hsl(var(--site-fg))");
    });

    it("a section's Medium and Soft undo the site's Small and Square", () => {
        const site = siteRules({ buttonSize: "s", cardCorners: "square" });
        expect(site).toContain(':not([data-site-own~="buttonSize"] *)');
        expect(site).toContain(':not([data-site-own~="cardCorners"] *)');
        const { container } = render(
            <PageSections
                sections={[
                    {
                        type: "hero",
                        content: {
                            heading: "Hello",
                            frame: {
                                styles: {
                                    button: { size: "m" },
                                    card: { corners: "soft" },
                                },
                            },
                        },
                    },
                ]}
            />,
        );
        const wrapper = container.querySelector("[data-site-own]");
        expect(wrapper?.getAttribute("data-site-own")).toBe(
            "buttonSize cardCorners",
        );
        // Soft puts back the corner a block reads with its own fallback.
        expect(container.querySelector("style")?.textContent).toContain(
            "--site-card-radius: initial",
        );
    });
});
