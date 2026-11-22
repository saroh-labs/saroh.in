import type { ComponentStyles, LookId } from "@saroh/block-contract";
import {
    COMPONENT_KINDS,
    COMPONENT_STYLE_OPTIONS,
    componentDefaults,
    defaultSiteStyle,
    LOOK_IDS,
    siteStyleVariables,
} from "@saroh/block-contract";
import { listTemplates, presetSiteStyle } from "@saroh/templates";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ctaClasses } from "./blocks/cta";
import { componentRules } from "./component-theme";
import { SiteTheme } from "./site-theme";

/**
 * Component styles (DEC-237, plan U1). A style with no `components` must
 * draw exactly the sheet it drew before component styles existed: the
 * look pin below was written BEFORE any component code landed (Classic's
 * is `classic-pin.test.tsx`), so a change to it is a change to every live
 * site with a look.
 */

const css = (variables: Record<string, string>, look?: LookId) =>
    renderToStaticMarkup(<SiteTheme variables={variables} look={look} />);

describe("a look's theme with no component styles is pinned", () => {
    for (const t of listTemplates()) {
        for (const s of t.styles ?? []) {
            for (const look of LOOK_IDS) {
                it(`${t.id} in ${s.id} under ${look}`, () => {
                    const style = presetSiteStyle({ ...s.style, look });
                    expect(
                        css(siteStyleVariables(style), style.look),
                    ).toMatchSnapshot();
                });
            }
        }
    }
});

const LOOKS_AND_CLASSIC = [undefined, ...LOOK_IDS] as const;

/** A site's sheet with these choices, as publishing would write it. */
const sheet = (look: LookId | undefined, components?: ComponentStyles) =>
    css(siteStyleVariables({ ...defaultSiteStyle(), look, components }), look);

const rules = (look: LookId | undefined, components: ComponentStyles) =>
    componentRules(
        ":root",
        look,
        siteStyleVariables({ ...defaultSiteStyle(), look, components }),
    );

describe("a look's defaults are today's page", () => {
    it.each(LOOKS_AND_CLASSIC.map((look) => [look ?? "classic", look]))(
        "%s: choosing every default writes nothing",
        (_, look) => {
            const defaults = componentDefaults(look);
            expect(rules(look, defaults)).toBe("");
            expect(sheet(look, defaults)).toBe(sheet(look));
        },
    );

    it("never writes a choice's word into the stylesheet", () => {
        const out = sheet("live", { buttons: "square" });
        expect(out).not.toContain("--site-choice-");
        expect(out).not.toContain("square");
    });

    it("drops a word this build does not know", () => {
        expect(
            componentRules(":root", "live", {
                "--site-choice-buttons": "wobbly",
            }),
        ).toBe("");
    });
});

describe("a choice changes only its own component", () => {
    it("square buttons under Live: buttons 0, cards keep Raised and 24px", () => {
        const out = rules("live", { buttons: "square" });
        expect(out).toContain("--site-button-radius: 0px;");
        expect(out).toContain("border-radius: var(--site-button-radius);");
        expect(out).not.toContain("--site-card-radius");
        expect(out).not.toContain("--site-image-radius");
        expect(out).not.toContain("box-shadow");
        // The look's own card corner is still drawn, before the choice.
        expect(sheet("live", { buttons: "square" })).toContain(
            "border-radius: var(--site-radius-photo);",
        );
    });

    it("square images under Live: photos 0, card radius untouched", () => {
        const out = rules("live", { images: "square" });
        expect(out).toContain("--site-image-radius: 0px;");
        expect(out).toContain("img.rounded-site-photo");
        expect(out).not.toContain("--site-card-radius");
        expect(out).not.toContain("--site-button-radius");
    });

    it("Flat cards set under Classic stay Flat through Quiet and back (KD1)", () => {
        const flat = { cards: "flat" } as const;
        expect(rules(undefined, flat)).toContain("border-color: transparent;");
        // Flat is Quiet's own: nothing to write, the look draws it.
        expect(rules("quiet", flat)).toBe("");
        // Live's own is Raised: Flat is written over it.
        expect(rules("live", flat)).toContain("box-shadow: none;");
    });

    it("spacing is relative to the look's own: Quiet's Airy is today's 120, Standard 96", () => {
        expect(rules("quiet", { spacing: "airy" })).toBe("");
        const standard = rules("quiet", { spacing: "standard" });
        expect(standard).toContain("--site-section-padding: 58px;");
        expect(standard).toContain("--site-section-padding: 96px;");
        // Classic scales the merchant's own slider.
        expect(rules(undefined, { spacing: "compact" })).toContain(
            "--site-section-padding: 39px;",
        );
    });

    it("Soft corners are the look's own: never written", () => {
        for (const look of LOOKS_AND_CLASSIC) {
            expect(rules(look, { cardCorners: "soft", images: "soft" })).toBe(
                "",
            );
        }
    });
});

/**
 * Every look × every option. What a browser would measure (44px, 4.5:1,
 * a visible ring) is held here by what the rules may write: no height, no
 * colour outside the palette's held roles, nothing on a focus state.
 * The pixels themselves are the browser specs' (U2's e2e).
 */
describe("every combination keeps the floor (R2)", () => {
    const cases = LOOKS_AND_CLASSIC.flatMap((look) =>
        COMPONENT_KINDS.flatMap((kind) =>
            COMPONENT_STYLE_OPTIONS[kind].map((id) => ({
                name: `${look ?? "classic"} ${kind}=${id}`,
                look,
                out: rules(look, { [kind]: id }),
            })),
        ),
    );
    // Button colour (DEC-252) adds the page, the accent and its words:
    // each a role the palette holds to 4.5:1 with its pair.
    const HELD =
        /hsl\(var\(--site-(fg|bg|surface|accent|accent-fg|rule, var\(--site-border\))\)/;

    it.each(cases)("$name", ({ out }) => {
        // No control is made shorter than its 44px touch floor.
        expect(out).not.toMatch(/(^|[^-])(min-)?height\s*:/m);
        // A ring is never drawn over or taken away.
        // `[-]`, not a bare hyphen: Tailwind scans this file, and the bare form crashes its candidate parser.
        expect(out).not.toMatch(/outline|ring|:focus(?![-]visible\))/);
        // The only colours written are the palette's held roles.
        const colours = out.match(/hsl\([^;]*/g) ?? [];
        for (const c of colours) expect(c).toMatch(HELD);
    });

    it("the shared button keeps its ring and its 44px touch floor", () => {
        for (const style of ["primary", "secondary", "link"] as const) {
            const classes = ctaClasses(style);
            expect(classes).toContain("coarse:min-h-11");
            expect(classes).toContain("focus-visible:ring-2");
        }
    });

    it("the site's focus outline is in every sheet, whatever the choice", () => {
        for (const look of LOOKS_AND_CLASSIC) {
            for (const id of COMPONENT_STYLE_OPTIONS.buttons) {
                expect(sheet(look, { buttons: id })).toContain(
                    "outline: 2px solid hsl(var(--site-fg));",
                );
            }
        }
    });
});
