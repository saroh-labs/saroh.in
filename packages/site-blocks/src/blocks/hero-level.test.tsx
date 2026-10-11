import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSections } from "../section-renderer";
import HeroSection from "./hero";
import { HeroHeading } from "./hero-heading";
import { heroLevels } from "./hero-level";

/**
 * One h1 a page (an SEO audit found two heroes gave two): only the page's
 * first hero is the `h1`, any later one an `h2`, whichever look it wears.
 * And the hero with no photo, which has to carry the page on type alone.
 */

const hero = (heading: string, over: Record<string, unknown> = {}) => ({
    type: "hero",
    content: { heading, ...over },
});
const text = {
    type: "richText",
    content: { format: "html", value: "<p>Hi</p>" },
};

const levelsOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("h1, h2")).map(
        (h) => `${h.tagName}:${h.textContent}`,
    );

describe("which heading a hero's headline is", () => {
    it("is 1 for the first hero and 2 for every one after", () => {
        expect(heroLevels([hero("A"), text, hero("B"), hero("C")])).toEqual([
            1, 1, 2, 2,
        ]);
        // The first hero need not be the first section.
        expect(heroLevels([text, hero("A"), hero("B")])).toEqual([1, 1, 2]);
        expect(heroLevels([])).toEqual([]);
    });

    it("is 2 for every hero on a page that opens on its own title", () => {
        expect(heroLevels([hero("A"), hero("B")], { titled: true })).toEqual([
            2, 2,
        ]);
    });

    it("isn't taken by a hero the visitor can't see", () => {
        expect(
            heroLevels([hero("Hidden"), hero("Shown")], {
                skip: (i) => i === 0,
            }),
        ).toEqual([1, 1]);
    });

    it("draws the tag for its level, and an h1 when it isn't told", () => {
        const { container } = render(
            <>
                <HeroHeading level={1}>One</HeroHeading>
                <HeroHeading level={2} className="sr-only">
                    Two
                </HeroHeading>
                <HeroHeading>Alone</HeroHeading>
            </>,
        );
        expect(
            Array.from(container.children).map(
                (h) => `${h.tagName}:${h.textContent}`,
            ),
        ).toEqual(["H1:One", "H2:Two", "H1:Alone"]);
        expect(container.querySelector("h2")).toHaveClass("sr-only");
    });
});

describe("a page's heroes", () => {
    it("gives two heroes one h1 and one h2", () => {
        const { container } = render(
            <PageSections
                sections={[hero("Welcome"), text, hero("Visit us")]}
            />,
        );
        expect(levelsOf(container)).toEqual(["H1:Welcome", "H2:Visit us"]);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("holds for every look a hero wears", () => {
        const looks: Record<string, unknown>[] = [
            {},
            { variant: "split", image: { src: "https://m.example.com/a.jpg" } },
            { variant: "fullBleed" },
            { variant: "none" },
            { variant: "none", titleVisible: false },
            // On today with nowhere to read from draws the plain hero.
            { onToday: true },
        ];
        for (const look of looks) {
            const { container, unmount } = render(
                <PageSections
                    sections={[hero("First"), hero("Second", look)]}
                    siteId={null}
                />,
            );
            expect(levelsOf(container), JSON.stringify(look)).toEqual([
                "H1:First",
                "H2:Second",
            ]);
            unmount();

            // And the same look is the h1 when it comes first.
            const again = render(
                <PageSections
                    sections={[hero("First", look), hero("Second")]}
                    siteId={null}
                />,
            );
            expect(levelsOf(again.container), JSON.stringify(look)).toEqual([
                "H1:First",
                "H2:Second",
            ]);
            again.unmount();
        }
    });

    it("has no h1 of its own under a module page's title, which is the page's", () => {
        const { container } = render(
            <PageSections
                sections={[hero("Our prices")]}
                top={{ title: "Prices", lead: null }}
            />,
        );
        expect(levelsOf(container)).toEqual(["H1:Prices", "H2:Our prices"]);
    });

    it("is the h1 when drawn on its own, as it always was", () => {
        render(<HeroSection content={{ heading: "Rye & Co." }} />);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
            "Rye & Co.",
        );
    });
});

describe("the hero with no photo", () => {
    it("carries the page on type: the display size, balanced, with room around it", () => {
        const { container } = render(
            <HeroSection
                content={{
                    heading: "Bread, baked every morning",
                    subheading: "A small bakery on 12th Main.",
                    cta: { label: "Order", href: "/shop" },
                }}
            />,
        );
        const section = container.querySelector("section");
        // The hero's colour edge to edge; the words in the page's column.
        expect(section).toHaveClass(
            "bg-site-hero-bg",
            "text-site-hero-fg",
            "w-full",
        );
        expect(section).not.toHaveClass("max-w-screen-xl");
        expect(section?.firstElementChild).toHaveClass(
            "max-w-screen-xl",
            "mx-auto",
        );
        // More room than a section, from the merchant's own padding.
        expect(section?.className).toContain(
            "py-[calc(var(--site-section-padding)*1.5)]",
        );
        expect(section).toHaveAttribute("data-site-ground", "hero");

        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1).toHaveClass("font-site-heading", "text-balance");
        expect(h1.className).toContain("var(--site-display-size,3.75rem)");
        expect(h1.className).toContain("var(--site-heading-scale)");
        expect(h1.className).toContain("tracking-[-0.03em]");

        // The line under it: a width that reads, at the template's body
        // size, and the hero's own colour at full strength.
        const line = screen.getByText("A small bakery on 12th Main.");
        expect(line.className).toContain("max-w-[54ch]");
        expect(line.className).toContain("var(--site-body-size,1rem)");
        expect(container.innerHTML).not.toMatch(/(?<![:\w-])opacity-\d/);
    });

    it("draws its button in the hero's own colours, not the page's", () => {
        render(
            <HeroSection
                content={{
                    heading: "Rye",
                    cta: {
                        label: "Read on",
                        href: "/about",
                        style: "secondary",
                    },
                }}
            />,
        );
        const button = screen.getByRole("link", { name: "Read on" });
        expect(button).toHaveClass("text-site-hero-fg", "border-site-hero-fg");
        expect(button.className).toContain("focus-visible:ring-site-hero-fg");
        expect(button.className).toContain(
            "focus-visible:ring-offset-site-hero-bg",
        );
    });

    it("takes a section's own padding with a photo beside it", () => {
        const { container } = render(
            <HeroSection
                content={{
                    heading: "Rye",
                    variant: "split",
                    image: {
                        src: "https://m.example.com/a.jpg",
                        alt: "Loaves",
                    },
                }}
            />,
        );
        const section = container.querySelector("section");
        expect(section?.className).toContain(
            "py-[var(--site-section-padding)]",
        );
        expect(screen.getByRole("img", { name: "Loaves" })).toBeInTheDocument();
    });
});
