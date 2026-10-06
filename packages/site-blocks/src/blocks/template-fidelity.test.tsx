import {
    BLOCK_META,
    hexToHslTriple,
    paletteVariables,
    parsePalette,
    typeScaleVariables,
} from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SAMPLE_PRODUCTS } from "../block-fixture-preview";
import { SiteTheme } from "../site-theme";
import FaqSection from "./faq";
import FeaturesSection from "./features";
import GallerySection from "./gallery";
import HeroSection from "./hero";
import ProductGridSection from "./product-grid";
import ProjectsSection from "./projects";
import RichTextSection from "./rich-text";

/**
 * A template's own palette and type scale reach the page (DEC-090), and the
 * looks its designs need — plates, captions over photos — draw bounded and
 * say their states in words.
 */

const GREEN = parsePalette({
    bg: "#F4F1E8",
    surface: "#EAE6DB",
    fg: "#1A1815",
    body: "#3B362E",
    muted: "#6E685E",
    border: "#DFDACD",
    accent: "#1F3D2B",
    accentFg: "#F9F7F1",
});
if (!GREEN.ok) throw new Error("palette refused");

function css(variables: Record<string, string> | null): string {
    const { container } = render(<SiteTheme variables={variables} />);
    return container.querySelector("style")?.textContent ?? "";
}

describe("SiteTheme with a template's palette and type scale", () => {
    it("writes the palette as HSL triples, never a hex", () => {
        const out = css(paletteVariables(GREEN.palette));
        expect(out).toContain(`--site-accent: ${hexToHslTriple("#1F3D2B")};`);
        expect(out).not.toMatch(/#[0-9A-F]{6}/i);
    });

    it("drops a hex or anything else the guard does not know", () => {
        const out = css({
            "--site-accent": "#1F3D2B",
            "--site-bg": "red; } body { display: none",
        });
        expect(out).not.toContain("#1F3D2B");
        expect(out).not.toContain("display: none");
    });

    it("writes the sizes and turns the label word into a fixed rule", () => {
        const out = css(
            typeScaleVariables({
                displaySize: 44,
                bodySize: 18.5,
                measure: 64,
                labelStyle: "eyebrowAccent",
            }),
        );
        expect(out).toContain("--site-display-size: 44px;");
        expect(out).toContain("--site-body-size: 18.5px;");
        expect(out).toContain("--site-measure: 64ch;");
        expect(out).toContain(":root [data-site-title]");
        expect(out).toContain("text-transform: uppercase;");
        expect(out).toContain("color: hsl(var(--site-accent));");
        // The word chooses a rule; it is never itself a declaration.
        expect(out).not.toContain("--site-label-style");
    });

    it("sets the eyebrow in the quiet text colour, and nothing for an unknown word", () => {
        expect(css({ "--site-label-style": "eyebrow" })).toContain(
            "color: hsl(var(--site-muted));",
        );
        expect(css({ "--site-label-style": "shouty" })).not.toContain(
            "[data-site-title]",
        );
        expect(css(null)).not.toContain("[data-site-title]");
    });
});

describe("blocks read the type scale, with today's sizes as fallbacks", () => {
    it("sets the hero's display line from --site-display-size", () => {
        render(<HeroSection content={BLOCK_META.hero.fixtures.centered} />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.className).toContain("var(--site-display-size,2.25rem)");
        expect(h1.className).toContain(
            "md:text-[calc(var(--site-display-size,3.75rem)",
        );
        expect(h1.className).toContain("font-site-heading");
    });

    it("sets text blocks' body size and reading width", () => {
        const { container } = render(
            <RichTextSection content={BLOCK_META.richText.fixtures.default} />,
        );
        const prose = container.querySelector(".prose");
        expect(prose?.className).toContain(
            "text-[length:var(--site-body-size,1rem)]",
        );
        expect(prose?.className).toContain("max-w-[var(--site-measure,none)]");
        expect(prose?.className).toContain("prose-headings:font-site-heading");
    });

    it("marks section titles for the eyebrow, in the site's heading face", () => {
        render(<FeaturesSection content={BLOCK_META.features.fixtures.grid} />);
        const title = screen.getByRole("heading", { level: 2 });
        expect(title.hasAttribute("data-site-title")).toBe(true);
        expect(title.className).toContain("font-site-heading");
        for (const h3 of screen.getAllByRole("heading", { level: 3 })) {
            expect(h3.className).toContain("font-site-heading");
        }
    });

    it("gives FAQ answers the body size", () => {
        const { container } = render(
            <FaqSection content={BLOCK_META.faq.fixtures.default} />,
        );
        expect(container.innerHTML).toContain(
            "text-[length:var(--site-body-size,1rem)]",
        );
        expect(
            container.querySelector("[data-site-title]")?.className,
        ).toContain("font-site-heading");
    });
});

describe("productGrid: plates", () => {
    const content = BLOCK_META.productGrid.fixtures.plates;

    it("puts each product in a fixed cell, the first twice the room", () => {
        const { container } = render(
            <ProductGridSection
                content={content}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        const grid = container.querySelector('[data-grid-look="plates"]');
        expect(grid?.className).toContain("auto-rows-[210px]");
        expect(grid?.className).toContain("gap-[var(--site-grid-gap)]");
        // The gap shows the page's hairline colour.
        expect(grid?.className).toContain("bg-site-border");
        const items = screen.getAllByRole("listitem");
        expect(items[0].className).toContain("md:row-span-2");
        expect(items[1].className).not.toContain("row-span-2");
    });

    it("sets the words on a bounded band over the photo, one line each", () => {
        const { container } = render(
            <ProductGridSection
                content={content}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        const bands = container.querySelectorAll("[data-plate-band]");
        expect(bands).toHaveLength(SAMPLE_PRODUCTS.length);
        expect(bands[0].className).toContain("h-[124px]");
        expect(bands[1].className).toContain("h-[96px]");
        for (const band of Array.from(bands)) {
            expect(band.className).toContain("overflow-hidden");
            // A scrim of the text colour, the words in the page colour.
            expect(band.className).toContain("from-site-fg/90");
            expect(band.className).toContain("text-site-bg");
            expect(band.firstElementChild?.className).toContain("truncate");
        }
    });

    it("says Sold out in words, in the cell's link", () => {
        render(
            <ProductGridSection
                content={content}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        const soldOut = SAMPLE_PRODUCTS.findIndex((p) => p.soldOut);
        const item = screen.getAllByRole("listitem")[soldOut];
        const link = within(item).getByRole("link");
        expect(link.textContent).toContain("Sold out");
        expect(within(item).getByText("Sold out").className).toContain(
            "uppercase",
        );
    });

    it("renders nothing with no products", () => {
        const { container } = render(
            <ProductGridSection
                content={content}
                feed={{ products: [], basePath: "/shop" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("captions over or below a photo", () => {
    it("keeps a gallery's captions below by default", () => {
        render(<GallerySection content={BLOCK_META.gallery.cases.captions} />);
        expect(screen.getByText("The counter, 6am").className).toContain(
            "mt-2",
        );
    });

    it("sets a gallery's captions over the photo on a bounded band", () => {
        render(
            <GallerySection content={BLOCK_META.gallery.cases.captionsOver} />,
        );
        const caption = screen
            .getByText("The counter, 6am")
            .closest("figcaption");
        expect(caption?.className).toContain("absolute");
        expect(caption?.className).toContain("max-h-[66px]");
        expect(caption?.className).toContain("overflow-hidden");
        expect(caption?.parentElement?.className).toContain("relative");
    });

    it("sets a project's title and caption over its photo", () => {
        const { container } = render(
            <ProjectsSection
                content={BLOCK_META.projects.cases.captionsOver}
            />,
        );
        const band = container.querySelector("[data-plate-band]");
        expect(band?.className).toContain("h-[66px]");
        expect(
            within(band as HTMLElement).getByRole("heading", { level: 3 })
                .className,
        ).toContain("truncate");
        expect(
            within(band as HTMLElement).getByText("Photographed on site"),
        ).toBeTruthy();
    });

    it("keeps projects' captions below the photo without it", () => {
        const { container } = render(
            <ProjectsSection content={BLOCK_META.projects.cases.captions} />,
        );
        expect(container.querySelector("[data-plate-band]")).toBeNull();
    });
});
