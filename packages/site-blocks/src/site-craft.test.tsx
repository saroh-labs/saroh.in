import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageSections } from "./section-renderer";
import { craftRules, SITE_EASE } from "./site-craft";
import { SiteTheme } from "./site-theme";

/**
 * The craft layer `SiteTheme` writes for every site (the starter site
 * work): base type, the reading column, the rhythm between sections, focus
 * and selection, and the little motion a site has. jsdom applies no
 * stylesheet, so these read the rules as written; how they look is checked
 * in a browser.
 */

/** The theme's stylesheet exactly as the server sends it. */
const css = (variables?: Record<string, string>, selector?: string) =>
    renderToStaticMarkup(
        <SiteTheme variables={variables} selector={selector} />,
    );

/** The declarations of the first rule whose selector contains `part`. */
function rule(sheet: string, part: string): string {
    const at = sheet.indexOf(part);
    if (at < 0) return "";
    const open = sheet.indexOf("{", at);
    return sheet.slice(open + 1, sheet.indexOf("}", open));
}

describe("the craft layer is part of every site's theme", () => {
    it("is written by SiteTheme, at the theme's own scope", () => {
        expect(css()).toContain(craftRules(":root", undefined).trim());
        const scoped = css(undefined, ".site-preview-scope");
        expect(scoped).toContain(
            ".site-preview-scope :is([data-site-section], [data-site-header], [data-site-footer], [data-site-page])",
        );
        // A scoped theme never writes a rule for the whole document.
        expect(scoped.match(/:root/g)).toBeNull();
    });

    it("reaches the browser as CSS: a child combinator and a quote are not escaped", () => {
        // A <style>'s text is read raw, so "&gt;" there would be a broken
        // selector, not a ">". These rules lean on both characters.
        const sheet = css();
        expect(sheet).not.toMatch(/&(?:gt|lt|quot|amp|#x27|#39);/);
        expect(sheet).toContain("[data-site-section] > .max-w-screen-md");
        expect(sheet).toContain(":has(> [data-site-ground])");
        expect(sheet).toContain('[aria-disabled="true"]');
    });

    it("draws from the site's tokens only: no colour of its own", () => {
        const rules = craftRules(":root", undefined);
        expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(rules).not.toMatch(/\b(?:black|white|rgb|rgba)\b/i);
        // Every colour is a --site-* token (or the typography plugin's
        // variable being pointed at one).
        for (const [, value] of rules.matchAll(/hsl\(([^)]*\))/g)) {
            expect(value).toMatch(/^var\(--site-[a-z-]+\)/);
        }
        expect(rules).not.toMatch(/saroh|geist|grotesk|jakarta/i);
    });
});

describe("base type", () => {
    const sheet = css();

    it("sets headings in the heading face, balanced, drawn in more as they grow", () => {
        const all = rule(sheet, ":is(h1, h2, h3, h4)");
        expect(all).toContain("font-family: var(--site-font-heading)");
        expect(all).toContain("text-wrap: balance");
        expect(rule(sheet, ") h1 {")).toContain("letter-spacing: -0.03em");
        expect(rule(sheet, ") h2 {")).toContain("letter-spacing: -0.02em");
        expect(rule(sheet, ") :is(h3, h4) {")).toContain(
            "letter-spacing: -0.01em",
        );
    });

    it("weighs less than any utility class, so a block's own choice wins", () => {
        // `:where(...)` adds nothing: the rule weighs as one element.
        expect(sheet).toMatch(/:where\(:root :is\([^)]*\)\) h1 \{/);
        expect(sheet).toMatch(/:where\(:root :is\([^)]*\)\) p \{/);
    });

    it("holds a text block's column to a measure that reads, when the site sets none", () => {
        const column = rule(sheet, "[data-site-section] > .max-w-screen-md");
        expect(column).toContain(
            "max-width: calc(62ch + 2 * var(--site-page-margin))",
        );
    });

    it("leaves a template's own measure and column exactly as they draw", () => {
        expect(css({ "--site-measure": "64ch" })).not.toContain(
            "[data-site-section] > .max-w-screen-md",
        );
        expect(css({ "--site-content-width": "820px" })).not.toContain(
            "[data-site-section] > .max-w-screen-md",
        );
    });

    it("styles a text block's lists, quotes, links and rules from the site's tokens", () => {
        const prose = rule(sheet, "[data-site-section] .prose {");
        for (const [variable, token] of [
            ["--tw-prose-bullets", "--site-muted"],
            ["--tw-prose-counters", "--site-muted"],
            ["--tw-prose-quote-borders", "--site-accent"],
            ["--tw-prose-links", "--site-accent"],
            ["--tw-prose-hr", "--site-border"],
            ["--tw-prose-td-borders", "--site-border"],
            ["--tw-prose-body", "--site-body"],
        ]) {
            expect(prose).toContain(`${variable}: hsl(var(${token}))`);
        }
        expect(rule(sheet, ".prose blockquote {")).toContain(
            "font-style: normal",
        );
        // A link is underlined: colour is never the only sign.
        expect(rule(sheet, ".prose a {")).toContain(
            "text-decoration-line: underline",
        );
        expect(rule(sheet, ".prose a:hover")).toContain(
            "text-decoration-thickness: 2px",
        );
    });

    it("selects text in the accent, and in each ground's own pair on the grounds that have one", () => {
        expect(rule(sheet, ":root ::selection")).toContain(
            "background-color: hsl(var(--site-accent))",
        );
        expect(rule(sheet, ":root ::selection")).toContain(
            "color: hsl(var(--site-accent-fg))",
        );
        expect(rule(sheet, "[data-site-footer] ::selection")).toContain(
            "background-color: hsl(var(--site-footer-fg))",
        );
        expect(rule(sheet, '[data-site-ground="cta"] ::selection')).toContain(
            "color: hsl(var(--site-cta-bg))",
        );
    });
});

describe("rhythm between sections", () => {
    const sheet = css();

    it("gives a banded section more room, from the merchant's own padding", () => {
        expect(rule(sheet, ":root {\n                --site-ease")).toContain(
            "--site-section-space: var(--site-section-padding)",
        );
        expect(rule(sheet, "[data-site-section][data-site-band] {")).toContain(
            "--site-section-padding: calc(var(--site-section-space) * 1.2)",
        );
    });

    it("draws two plain sections in a row closer, and never a block that paints its own ground", () => {
        const selector =
            '[data-site-section]:not([data-site-band]):not(:empty):not(:has(> [data-site-ground])) + [data-site-section]:not([data-site-band]) > [class*="py-[var(--site-section-padding)]"]:not([data-site-ground])';
        expect(sheet).toContain(selector);
        expect(rule(sheet, selector)).toContain(
            "padding-top: calc(var(--site-section-padding) * 0.5)",
        );
    });

    it("finds a block's root by the padding class the blocks really write", () => {
        // The rule matches the class by its text, so it only ever makes a
        // gap smaller. If a block's root stops writing this class, the
        // rule simply stops reaching it: this says so out loud.
        const padded = "py-[var(--site-section-padding)]";
        const { container } = render(
            <PageSections
                sections={[
                    {
                        type: "richText",
                        content: { format: "html", value: "<p>One</p>" },
                    },
                    {
                        type: "faq",
                        content: {
                            items: [{ question: "Q", answer: "A" }],
                        },
                    },
                    { type: "cta", content: { label: "Go", href: "/x" } },
                ]}
            />,
        );
        const roots = Array.from(
            container.querySelectorAll("[data-site-section] > *"),
        );
        expect(roots).toHaveLength(3);
        for (const root of roots) {
            expect(root.className).toContain(padded);
        }
        // The closing band paints its own ground, so it is left alone.
        expect(roots[2]).toHaveAttribute("data-site-ground", "cta");
        expect(roots[0]).not.toHaveAttribute("data-site-ground");
    });

    it("sets no fixed length: the Style slider still moves the whole page", () => {
        const rhythm = sheet.slice(
            sheet.indexOf("[data-site-section][data-site-band] {"),
            sheet.indexOf(":where(:root :is([data-site-section]"),
        );
        expect(rhythm).not.toMatch(/\d(?:px|rem)\b/);
    });
});

describe("states", () => {
    const sheet = css();

    it("gives every link and button a focus mark in its ground's own text colour", () => {
        const grounds: [string, string][] = [
            [
                ":is([data-site-section], [data-site-header], [data-site-page])) :where(a, button, summary):focus-visible",
                "--site-fg",
            ],
            ['[data-site-ground="hero"]) :where(', "--site-hero-fg"],
            ['[data-site-ground="cta"]) :where(', "--site-cta-fg"],
            ['[data-site-ground="photo"]) :where(', "--site-bg"],
            ["[data-site-footer]) :where(a, button", "--site-footer-fg"],
        ];
        for (const [part, token] of grounds) {
            expect(sheet, part).toContain(part);
            expect(rule(sheet, part), part).toContain(`hsl(var(${token}))`);
        }
        const page = rule(sheet, grounds[0][0]);
        expect(page).toContain("outline: 2px solid");
        expect(page).toContain("outline-offset: 2px");
    });

    it("only on :focus-visible, and never over a control's own designed ring", () => {
        // One pseudo-class of weight, under a `focus-visible:` utility's
        // two, so a button with its own ring shows no second one.
        const marks = sheet.match(/[^\n]*:focus-visible \{/g) ?? [];
        expect(marks).toHaveLength(5);
        for (const mark of marks) {
            expect(mark.trim()).toMatch(
                /^:where\(.*\) :where\(a, button, summary\):focus-visible \{$/,
            );
        }
        expect(sheet).not.toMatch(/:focus \{/);
    });

    it("takes the pointer off a disabled control", () => {
        expect(
            rule(sheet, ':where(button:disabled, [aria-disabled="true"])'),
        ).toContain("cursor: default");
    });
});

describe("motion", () => {
    const sheet = css();

    it("moves on one curve that never overshoots, in 200ms or less", () => {
        expect(sheet).toContain(`--site-ease: ${SITE_EASE}`);
        const [, x1, y1, x2, y2] =
            /cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(
                SITE_EASE,
            ) ?? [];
        for (const n of [x1, y1, x2, y2].map(Number)) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(1);
        }
        const craft = craftRules(":root", undefined);
        for (const [, ms] of craft.matchAll(/(\d+)ms/g)) {
            expect(Number(ms)).toBeLessThanOrEqual(200);
        }
        expect(craft).not.toMatch(/\bease-in-out\b|\blinear\b|infinite/);
    });

    it("animates transform and opacity only", () => {
        const frames = sheet.slice(sheet.indexOf("@keyframes site-rise"));
        const animated = Array.from(
            frames
                .slice(0, frames.indexOf("@media"))
                .matchAll(/^\s*([a-z-]+):/gm),
        ).map((m) => m[1]);
        expect(new Set(animated)).toEqual(new Set(["opacity", "transform"]));
    });

    it("moves nothing for a visitor who asked for less motion", () => {
        // Every animation and transition sits inside a no-preference query.
        const outside = sheet
            .split("@media")
            .filter(
                (part) =>
                    !/^[^{]*prefers-reduced-motion: no-preference/.test(part),
            )
            .join("")
            .replace(/@keyframes[\s\S]*?\}\s*\}/g, "");
        expect(outside).not.toMatch(/\banimation(?:-[a-z]+)?:/);
        expect(outside).not.toMatch(/\btransition:/);
    });

    it("brings a section in with the scroll, with no script and nothing hidden without one", () => {
        const entrance = sheet.slice(
            sheet.indexOf("@media screen and (prefers-reduced-motion"),
        );
        // Behind @supports for the exact range: a browser without scroll
        // timelines draws the section as it is.
        expect(entrance).toContain(
            "@supports (animation-timeline: view()) and (animation-range: entry 0% entry 180px)",
        );
        expect(entrance).toContain("animation-timeline: view()");
        // It lets go once the section is in: no fill that stays.
        expect(entrance).toContain(
            "animation: site-rise var(--site-ease) backwards",
        );
        expect(entrance).not.toMatch(/\b(?:forwards|both)\b/);
        // Screens only: a printed page is all there.
        expect(entrance).toMatch(/^@media screen and/);
        // Nothing outside that query ever sets a section's opacity.
        expect(sheet.replace(entrance, "")).not.toMatch(
            /\[data-site-section\][^{]*\{[^}]*\bopacity\s*:/,
        );
    });

    it("keeps the entrance off the editor's canvas and a catalog tile", () => {
        const scoped = css(undefined, ".site-preview-scope");
        expect(scoped).not.toContain("animation-timeline");
        // The phone menu still eases in there.
        expect(scoped).toContain("[data-site-menu-panel]");
    });
});
