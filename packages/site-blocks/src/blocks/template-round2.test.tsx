import type { RenderedFeatures, RenderedRichText } from "@saroh/block-contract";
import {
    BLOCK_META,
    paletteVariables,
    parsePalette,
    typeScaleVariables,
} from "@saroh/block-contract";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SAMPLE_PRODUCTS, SAMPLE_VISIT } from "../block-fixture-preview";
import { SiteFooter } from "../site-chrome";
import { SiteTheme } from "../site-theme";
import { siteColors } from "../tailwind-preset";
import FeaturesSection from "./features";
import FullBleedHero from "./hero-full-bleed";
import HoursSection from "./hours";
import ProductGridSection from "./product-grid";
import RichTextSection from "./rich-text";

/**
 * Template round 2: five across, the open dot's own colour, labels in a
 * text block, a display intro and the footer row on the page's column.
 * Each is absent by default, and absent draws what it drew before.
 */

const TUESDAY = new Date("2026-10-06T09:00:00.000Z");

function css(variables: Record<string, string> | null): string {
    return renderToStaticMarkup(<SiteTheme variables={variables} />);
}

describe("productGrid bare: a set number across", () => {
    const bare = BLOCK_META.productGrid.cases.bare;

    it("lays five across at the desk, stepping down to two on a phone", () => {
        const { container } = render(
            <ProductGridSection
                content={{ ...bare, columns: 5 }}
                feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
            />,
        );
        const grid = container.querySelector("ul")?.className ?? "";
        expect(grid).toContain("xl:grid-cols-5");
        expect(grid).toContain("min-[360px]:grid-cols-2");
        expect(grid).toContain("grid-cols-1");
        expect(grid).not.toContain("auto-fill");
    });

    it("fills the row by the card's width without a count, or with one it does not know", () => {
        for (const columns of [undefined, 7]) {
            const { container, unmount } = render(
                <ProductGridSection
                    content={{ ...bare, columns }}
                    feed={{ products: SAMPLE_PRODUCTS, basePath: "/shop" }}
                />,
            );
            expect(container.querySelector("ul")?.className).toContain(
                "auto-fill",
            );
            unmount();
        }
    });
});

describe("the open dot's colour (status roles)", () => {
    it("falls back to the accent wherever the palette names no status", () => {
        expect(siteColors.status).toBe(
            "hsl(var(--site-status, var(--site-accent)))",
        );
        expect(siteColors["status-inverse"]).toBe(
            "hsl(var(--site-status-inverse, var(--site-accent)))",
        );
    });

    it("draws the hours' open dot in the status colour, closed in the quiet one", () => {
        const { container } = render(
            <HoursSection
                content={BLOCK_META.hours.fixtures.default}
                visit={SAMPLE_VISIT}
                now={TUESDAY}
            />,
        );
        expect(container.querySelector(".bg-site-status")).not.toBeNull();
        expect(container.querySelector(".bg-site-accent")).toBeNull();
    });

    it("draws the hero's open dot over the photo in the inverse status", () => {
        const { container } = render(
            <FullBleedHero
                content={BLOCK_META.hero.fixtures.fullBleed}
                visit={SAMPLE_VISIT}
                now={TUESDAY}
            />,
        );
        expect(
            container.querySelector(".bg-site-status-inverse"),
        ).not.toBeNull();
    });

    it("publishes a named status and swaps the two in an inverse band", () => {
        const parsed = parsePalette({
            bg: "#FBF7EF",
            fg: "#2A1F14",
            accent: "#8A3324",
            accentFg: "#FBF7EF",
            status: "#4E8A36",
            statusInverse: "#9BD17B",
        });
        if (!parsed.ok) throw new Error("palette refused");
        const out = css(paletteVariables(parsed.palette));
        expect(out).toMatch(/--site-status: [\d.]+ [\d.]+% [\d.]+%;/);
        expect(out).toMatch(/--site-status-inverse: [\d.]+ [\d.]+% [\d.]+%;/);
        expect(out).toContain(
            "--site-status: var(--site-band-status-inverse);",
        );
        // An accent band clears both, so the dot is the accent's text.
        expect(out).toContain("--site-status: initial;");
    });
});

describe("richText: labels for its headings, its facts and over it", () => {
    const base: RenderedRichText = {
        variant: "default",
        format: "html",
        value: "<h2>The studio</h2><p>Words.</p><dl><dt>Studio</dt><dd>Pune</dd></dl>",
    };

    it("marks the prose so SiteTheme sets its headings and facts as labels", () => {
        const { container } = render(
            <RichTextSection
                content={{
                    ...base,
                    headingStyle: "label",
                    factsStyle: "labels",
                }}
            />,
        );
        const prose = container.querySelector(".prose");
        expect(prose?.getAttribute("data-site-headings")).toBe("label");
        expect(prose?.getAttribute("data-site-facts")).toBe("labels");
    });

    it("marks nothing by default, or for a style it does not know", () => {
        const { container } = render(
            <RichTextSection content={{ ...base, headingStyle: "shouty" }} />,
        );
        const prose = container.querySelector(".prose");
        expect(prose?.hasAttribute("data-site-headings")).toBe(false);
        expect(prose?.hasAttribute("data-site-facts")).toBe(false);
    });

    it("sets the text's h2 and h3 as section titles only while titles are an eyebrow", () => {
        const eyebrow = css(typeScaleVariables({ labelStyle: "eyebrow" }));
        expect(eyebrow).toContain('[data-site-headings="label"] :is(h2, h3)');
        expect(css(null)).not.toContain("data-site-headings");
    });

    it("writes the facts rule: terms as quiet uppercase labels", () => {
        const out = css(null);
        expect(out).toMatch(
            /\[data-site-facts="labels"\] dt \{[^}]*text-transform: uppercase;/,
        );
        expect(out).toMatch(
            /\[data-site-facts="labels"\] dt \{[^}]*color: hsl\(var\(--site-muted\)\);/,
        );
    });

    it("draws a label over the text, not as a heading", () => {
        render(<RichTextSection content={{ ...base, label: "The starter" }} />);
        const label = screen.getByText("The starter");
        expect(label.tagName).toBe("P");
        expect(label.hasAttribute("data-site-title")).toBe(true);
        expect(label.className).toContain("uppercase");
        // The text's own heading is still the heading.
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
            "The studio",
        );
    });

    it("draws no label when it is blank", () => {
        const { container } = render(
            <RichTextSection content={{ ...base, label: "  " }} />,
        );
        expect(container.querySelector("p[data-site-title]")).toBeNull();
    });
});

describe("features: the intro as a display line", () => {
    const grid = BLOCK_META.features.fixtures.grid as RenderedFeatures;
    const intro = "Three variables, and not one of them behaves the same way.";

    it("sets the intro large in the heading face", () => {
        render(
            <FeaturesSection
                content={{ ...grid, intro, introStyle: "display" }}
            />,
        );
        const line = screen.getByText(intro);
        expect(line.className).toContain("font-site-heading");
        expect(line.className).toContain("text-site-fg");
    });

    it("keeps the quiet paragraph by default", () => {
        render(<FeaturesSection content={{ ...grid, intro }} />);
        const line = screen.getByText(intro);
        expect(line.className).toContain("text-site-body");
        expect(line.className).not.toContain("font-site-heading");
    });
});

describe("the footer row on the page's column", () => {
    it("puts the margins inside the column, as the header does", () => {
        const { container } = render(
            <SiteFooter
                footer={{
                    format: "markdown",
                    value: "14 Hill Road · Closed Mondays",
                    layout: "left",
                }}
                name="Rye & Co."
            />,
        );
        const footer = container.querySelector("footer");
        expect(footer?.className).not.toContain("px-5");
        const column = footer?.firstElementChild;
        expect(column?.className).toContain("max-w-site-content");
        expect(column?.className).toContain("sm:px-[var(--site-page-margin)]");
        // Name and line on one row; a paid site shows no Saroh credit.
        const row = column?.lastElementChild;
        expect(
            Array.from(row?.children ?? []).map((c) => c.textContent),
        ).toEqual(["Rye & Co.", "14 Hill Road · Closed Mondays"]);
    });
});
