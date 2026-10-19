import { SYSTEM_FONT_STACK } from "@saroh/block-contract";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fontPairStacks, SiteTheme } from "./site-theme";
import { SITE_FONT_STACK } from "./tailwind-preset";

/**
 * A site's typeface pair (industry templates plan, KTD-2). The snapshot
 * carries the pair's KEY in `--site-font-heading/body`; `SiteTheme` turns it
 * into stacks from the curated list, using the faces the app loaded.
 */
describe("fontPairStacks", () => {
    it("maps a key to its heading and body families", () => {
        const stacks = fontPairStacks("fraunces-inter-tight");
        expect(stacks?.heading).toMatch(/^"Fraunces", Georgia/);
        expect(stacks?.body).toMatch(/^"Inter Tight", ui-sans-serif/);
    });

    it("uses the family the app's loader registered", () => {
        const stacks = fontPairStacks("fraunces-inter-tight", {
            Fraunces: "'__Fraunces_a1', '__Fraunces_Fallback_a1'",
        });
        expect(stacks?.heading).toMatch(
            /^'__Fraunces_a1', '__Fraunces_Fallback_a1', Georgia/,
        );
        // Not loaded: the plain name, then the fallback.
        expect(stacks?.body).toMatch(/^"Inter Tight", /);
    });

    it("ignores a loaded family that could break out of the stylesheet", () => {
        const stacks = fontPairStacks("newsreader", {
            Newsreader: "x; } body { display: none",
        });
        expect(stacks?.heading).toMatch(/^"Newsreader", /);
    });

    it("answers null for a key that is not listed", () => {
        expect(fontPairStacks("comic-sans")).toBeNull();
        expect(fontPairStacks(undefined)).toBeNull();
    });

    it("finds a look's face under its own key, not its family (U3)", () => {
        const faces = {
            // The full-range Newsreader of the `newsreader` pair...
            Newsreader: "'__Newsreader_a1'",
            // ...and Folio's trimmed copy of the same family.
            "folio:heading": "'__Newsreader_b2'",
            "folio:body": "'__Hanken_Grotesk_c3'",
        };
        const folio = fontPairStacks("folio", faces);
        expect(folio?.heading).toMatch(/^'__Newsreader_b2', Georgia/);
        expect(folio?.body).toMatch(/^'__Hanken_Grotesk_c3', ui-sans-serif/);
        expect(folio?.mono).toBeUndefined();
        // The first pair is still set in the face it always was.
        expect(fontPairStacks("newsreader", faces)?.heading).toMatch(
            /^'__Newsreader_a1', /,
        );
    });

    it("names a look's families plainly where nothing was loaded", () => {
        const quiet = fontPairStacks("quiet");
        expect(quiet?.heading).toMatch(/^"Cormorant Garamond", Georgia/);
        expect(quiet?.body).toMatch(/^"Jost", ui-sans-serif/);
    });

    it("keeps the system pair on the neutral stack", () => {
        expect(fontPairStacks("system")).toEqual({
            heading: SITE_FONT_STACK,
            body: SITE_FONT_STACK,
        });
    });
});

describe("SiteTheme with a font pair", () => {
    const css = (variables: Record<string, string>, faces?: object) =>
        render(
            <SiteTheme
                variables={variables}
                faces={faces as Record<string, string>}
            />,
        ).container.querySelector("style")?.textContent ?? "";

    it("sets both font variables from the pair's key", () => {
        const out = css({
            "--site-bg": "40 30% 96%",
            "--site-font-heading": "archivo-narrow",
            "--site-font-body": "archivo-narrow",
        });
        expect(out).toMatch(/--site-font-heading: "Archivo Narrow", /);
        expect(out).toMatch(/--site-font-body: "Archivo", /);
    });

    it("never writes the variable's value itself, and drops an unknown key", () => {
        const out = css({
            "--site-bg": "40 30% 96%",
            "--site-font-heading": "comic-sans",
            "--site-font-body": '"Papyrus"',
        });
        expect(out).not.toContain("comic-sans");
        expect(out).not.toContain("Papyrus");
        // The defaults above still hold.
        expect(out).toContain(`--site-font-heading: ${SITE_FONT_STACK};`);
    });

    it("sets a Classic site, with no font variable, in no loaded face", () => {
        const faces = {
            "quiet:heading": "'__Cormorant_Garamond_q1'",
            "quiet:body": "'__Jost_q2'",
        };
        const out = css({ "--site-bg": "40 30% 96%" }, faces);
        expect(out).not.toContain("__Cormorant");
        expect(out).not.toContain("__Jost");
        expect(out).toContain(`--site-font-body: ${SITE_FONT_STACK};`);
    });

    it("sets a look's pair in its loaded faces", () => {
        const out = css(
            {
                "--site-bg": "40 30% 96%",
                "--site-font-heading": "live",
                "--site-font-body": "live",
            },
            {
                "live:heading": "'__Bricolage_Grotesque_l1'",
                "live:body": "'__Figtree_l2'",
            },
        );
        expect(out).toMatch(
            /--site-font-heading: '__Bricolage_Grotesque_l1', /,
        );
        expect(out).toMatch(/--site-font-body: '__Figtree_l2', /);
    });
});

describe("the system stack", () => {
    it("is the same in the contract and the Tailwind preset", () => {
        // Two copies on purpose (the preset feeds Tailwind configs, which
        // must not load a built package); this keeps them one value.
        expect(SYSTEM_FONT_STACK).toBe(SITE_FONT_STACK);
    });
});
