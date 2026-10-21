import type { LookId } from "@saroh/block-contract";
import { LOOK_IDS, LOOKS } from "@saroh/block-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { lookOf, lookScope } from "./look-context";
import { HELD_AFTER_MS, RUPEE_FAMILY, withRupee } from "./look-theme";
import SectionRenderer, {
    opensOverPhoto,
    PageSections,
    withLookVariant,
} from "./section-renderer";
import { craftRules } from "./site-craft";
import { SiteTheme, SiteThemeScope } from "./site-theme";

/**
 * The renderer draws a look (DEC-172, plan U4): its tokens under the
 * business's colours, its faces, its type, its motion (fade or rise, 200ms
 * or less, no bounce, no loops, reduced motion respected), and its layout
 * where a section chose none. Classic is pinned separately
 * (`classic-pin.test.tsx`); here it is only checked that a look's absence,
 * or a value this build does not know, IS Classic.
 */

/** A merchant's published variables, as the publisher writes them. */
const MERCHANT = {
    "--site-bg": "40 30% 96%",
    "--site-fg": "24 10% 10%",
    "--site-accent": "18 45% 45%",
    "--site-radius": "2px",
    "--site-page-margin": "38px",
    "--site-section-padding": "52px",
    "--site-font-heading": "fraunces",
    "--site-font-body": "fraunces",
    "--site-content-width": "820px",
    "--site-measure": "58ch",
    "--site-label-style": "eyebrowAccent",
};

/** The faces an app loaded, as `next/font` names them. */
const FACES = {
    "folio:heading": "'__Newsreader_a1', '__Newsreader_Fallback_a1'",
    "folio:body": "'__Hanken_Grotesk_b2', '__Hanken_Grotesk_Fallback_b2'",
    "quiet:heading":
        "'__Cormorant_Garamond_c3', '__Cormorant_Garamond_Fallback_c3'",
    "quiet:body": "'__Jost_d4', '__Jost_Fallback_d4'",
    "live:heading":
        "'__Bricolage_Grotesque_e5', '__Bricolage_Grotesque_Fallback_e5'",
    "live:body": "'__Figtree_f6', '__Figtree_Fallback_f6'",
};

const css = (
    look?: unknown,
    variables: Record<string, string> | null = MERCHANT,
    selector?: string,
) =>
    renderToStaticMarkup(
        <SiteTheme
            variables={variables}
            selector={selector}
            faces={FACES}
            look={look}
        />,
    );

/** The text between the first `{` after `part` and its matching `}`. */
function block(sheet: string, part: string, from = 0): string {
    const at = sheet.indexOf(part, from);
    if (at < 0) return "";
    const open = sheet.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < sheet.length; i++) {
        if (sheet[i] === "{") depth++;
        if (sheet[i] === "}") depth--;
        if (depth === 0) return sheet.slice(open + 1, i);
    }
    return "";
}

/**
 * The value `name` is given in the look's own rule (the one that sets
 * `--site-radius-s`), or in the whole sheet's last declaration of it for
 * a sheet with no look.
 */
function lastValue(sheet: string, name: string): string | undefined {
    const mark = sheet.indexOf("--site-radius-s:");
    const scope =
        mark < 0
            ? sheet
            : sheet.slice(
                  sheet.lastIndexOf("{", mark),
                  sheet.indexOf("}", mark),
              );
    const all = [...scope.matchAll(new RegExp(`${name}: ([^;]+);`, "g"))];
    return all.at(-1)?.[1];
}

describe("no look is Classic", () => {
    it("an absent look, null, 'classic' or an unknown id all draw Classic's sheet", () => {
        const classic = css(undefined);
        for (const value of [null, "classic", "neon", 3, { id: "quiet" }]) {
            expect(css(value)).toBe(classic);
        }
        expect(lookOf("classic")).toBeUndefined();
        expect(lookOf("quiet")).toBe("quiet");
    });

    it("marks no root for Classic, and the look's id for a look", () => {
        expect(lookScope(undefined)).toEqual({});
        expect(lookScope("neon")).toEqual({});
        expect(lookScope("folio")).toEqual({ "data-site-look": "folio" });
    });
});

describe("a look's tokens", () => {
    it("Quiet: pill buttons, its photo and small corners, its phone and desk spacing", () => {
        const sheet = css("quiet");
        expect(lastValue(sheet, "--site-radius")).toBe("999px");
        expect(lastValue(sheet, "--site-radius-photo")).toBe("16px");
        expect(lastValue(sheet, "--site-radius-s")).toBe("12px");
        expect(lastValue(sheet, "--site-page-margin")).toBe("20px");
        expect(lastValue(sheet, "--site-section-padding")).toBe("64px");
        const desk = block(sheet, "@media (min-width: 768px)");
        expect(desk).toContain("--site-page-margin: 48px;");
        expect(desk).toContain("--site-section-padding: 120px;");
    });

    it("Folio: square corners everywhere", () => {
        const sheet = css("folio");
        expect(lastValue(sheet, "--site-radius")).toBe("0px");
        expect(lastValue(sheet, "--site-radius-s")).toBe("0px");
        expect(lastValue(sheet, "--site-radius-photo")).toBe("0px");
    });

    it("every look writes every token, from its own data", () => {
        for (const id of LOOK_IDS) {
            const { tokens, motion } = LOOKS[id];
            const sheet = css(id);
            expect(lastValue(sheet, "--site-radius")).toBe(
                `${tokens.radius}px`,
            );
            expect(lastValue(sheet, "--site-page-margin")).toBe(
                `${tokens.pageMargin.phone}px`,
            );
            expect(lastValue(sheet, "--site-motion-slow")).toBe(
                `${motion.slow}ms`,
            );
            expect(lastValue(sheet, "--site-rise")).toBe(`${motion.rise}px`);
            expect(lastValue(sheet, "--site-measure")).toBe(
                `${LOOKS[id].type.measure}ch`,
            );
        }
    });

    it("wins over the merchant's spacing and corners, and keeps their colours", () => {
        const sheet = css("quiet");
        // The merchant's declarations are still written, unchanged...
        expect(sheet).toContain("--site-radius: 2px;");
        expect(sheet).toContain("--site-accent: 18 45% 45%;");
        // ...and the look's come after them.
        expect(sheet.lastIndexOf("--site-radius: 999px;")).toBeGreaterThan(
            sheet.indexOf("--site-radius: 2px;"),
        );
        // No colour of the look's own: colours are the business's.
        const tokens = sheet.slice(
            sheet.indexOf("--site-radius: 999px"),
            sheet.indexOf("@media (min-width: 768px)"),
        );
        expect(tokens).not.toMatch(
            /--site-(?:bg|fg|surface|accent(?:-fg|-text|-soft)?|body|muted|border|rule|hero-(?:bg|fg)|cta-(?:bg|fg)|footer-(?:bg|fg|muted)):/,
        );
    });

    it("never writes a Saroh token or face", () => {
        for (const id of LOOK_IDS) {
            const sheet = css(id);
            expect(sheet).not.toMatch(
                /--(?:primary|highlight|brand|saffron)\b|(?<![-\w])font-(?:sans|display|mono)\b(?!:)|Geist|Space Grotesk|JetBrains/i,
            );
        }
    });
});

describe("a look's type", () => {
    it("sets the look's faces, not the merchant's pair, and no mono", () => {
        const sheet = css("quiet");
        const heading = lastValue(sheet, "--site-font-heading") ?? "";
        expect(heading.startsWith("'__Cormorant_Garamond_c3'")).toBe(true);
        expect(lastValue(sheet, "--site-font-mono")).toBe("initial");
        expect(lastValue(sheet, "--site-font-body")).not.toMatch(/Fraunces/);
    });

    it("Folio and Quiet take the rupee sign from a sans face beside their body face; Live's draws its own", () => {
        const quiet = css("quiet");
        expect(
            lastValue(quiet, "--site-font-body")?.startsWith(
                `'__Jost_d4', "${RUPEE_FAMILY}", '__Jost_Fallback_d4', `,
            ),
        ).toBe(true);
        const face = block(quiet, "@font-face");
        expect(face).toContain(`font-family: "${RUPEE_FAMILY}"`);
        expect(face).toContain("unicode-range: U+20B9;");
        expect(face).toContain('local("Arial")');
        expect(face).not.toMatch(/url\(/);
        expect(quiet.match(/@font-face/g)).toHaveLength(2);

        const folio = css("folio");
        expect(lastValue(folio, "--site-font-body")).toContain(
            `'__Hanken_Grotesk_b2', "${RUPEE_FAMILY}"`,
        );

        const live = css("live");
        expect(live).not.toContain(RUPEE_FAMILY);
        expect(live).not.toContain("@font-face");
        // Classic is never given one.
        expect(css(undefined)).not.toContain(RUPEE_FAMILY);
    });

    it("puts the rupee right after the first family of any stack", () => {
        expect(withRupee('"Jost", ui-sans-serif')).toBe(
            `"Jost", "${RUPEE_FAMILY}", ui-sans-serif`,
        );
        expect(withRupee('"Jost"')).toBe(`"Jost", "${RUPEE_FAMILY}"`);
    });

    it("replaces the template's type scale: its column is cleared, its label style the look's", () => {
        const folio = css("folio");
        expect(lastValue(folio, "--site-display-size")).toBe("64px");
        expect(lastValue(folio, "--site-content-width")).toBe("initial");
        // No column rule for a width the look does not set.
        expect(folio).not.toContain("max-width: var(--site-content-width)");
        // Folio's section titles are eyebrows in the quiet colour, not the
        // template's accent ones.
        const label = block(folio, ":is([data-site-title]");
        expect(label).toContain("color: hsl(var(--site-muted));");
        expect(label).not.toContain("--site-accent");
        // Quiet sets no label style: plain titles.
        expect(css("quiet")).not.toContain("letter-spacing: 0.14em;");
    });

    it("never flips to dark for the visitor's preference, even with no variables", () => {
        expect(css(undefined, null)).toContain("prefers-color-scheme: dark");
        expect(css("quiet", null)).not.toContain("prefers-color-scheme");
    });

    it("scopes like Classic: a wrapper's selector, never the root", () => {
        const scoped = css("live", MERCHANT, ".site-theme-x");
        expect(scoped.match(/:root/g)).toBeNull();
        expect(scoped).toContain(".site-theme-x {");
        const html = renderToStaticMarkup(
            <SiteThemeScope name="x" look="live" variables={MERCHANT}>
                <p>hi</p>
            </SiteThemeScope>,
        );
        expect(html).toContain('data-site-look="live"');
    });
});

/** Every `NNNms` / `N.Ns` duration in a sheet, in ms. */
/**
 * Every time in a sheet that is a motion's length. A loading shape's
 * hold (`animation-delay`, U15: still shapes after 300ms) is a wait before
 * anything shows, not a motion, so it is left out; its own test holds it.
 */
function durations(sheet: string): number[] {
    const motion = sheet.replace(/animation-delay:[^;]*;/g, "");
    return [...motion.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map(
        ([, n, unit]) => (unit === "s" ? Number(n) * 1000 : Number(n)),
    );
}

describe("motion", () => {
    const sheets: [string, string][] = [
        ["Classic", craftRules(":root", undefined)],
        ...LOOK_IDS.map((id): [string, string] => [
            id,
            craftRules(":root", undefined, id),
        ]),
        ...LOOK_IDS.map((id): [string, string] => [`${id} (theme)`, css(id)]),
    ];

    it.each(sheets)(
        "%s: nothing lasts over 200ms, loops or overshoots",
        (_, sheet) => {
            for (const ms of durations(sheet))
                expect(ms).toBeLessThanOrEqual(200);
            expect(sheet).not.toMatch(/infinite/);
            expect(sheet).not.toMatch(/iteration-count/);
            expect(sheet).not.toMatch(/\balternate\b/);
            for (const [, args] of sheet.matchAll(/cubic-bezier\(([^)]*)\)/g)) {
                for (const v of args.split(",").map(Number)) {
                    expect(v).toBeLessThanOrEqual(1);
                    expect(v).toBeGreaterThanOrEqual(0);
                }
            }
            expect(sheet).not.toMatch(/\b(?:ease-in-out|spring|bounce)\b/);
        },
    );

    it.each(LOOK_IDS)(
        "%s: reduced motion turns every animation into a fade",
        (id) => {
            const sheet = craftRules(":root", undefined, id);
            const reduce = block(sheet, "prefers-reduced-motion: reduce");
            expect(reduce).not.toBe("");
            const names = [...reduce.matchAll(/animation: ([\w-]+)/g)].map(
                (m) => m[1],
            );
            expect(names.length).toBeGreaterThan(0);
            for (const name of names) expect(name).toBe("site-fade-in");
            // And the fade moves nothing.
            expect(block(sheet, "@keyframes site-fade-in")).not.toContain(
                "transform",
            );
            // Everything that moves under no-preference has a reduced twin.
            const moving = block(
                sheet,
                "prefers-reduced-motion: no-preference",
                sheet.lastIndexOf("prefers-reduced-motion: no-preference"),
            );
            for (const mark of [
                "data-site-menu-panel",
                "data-site-menu-scrim",
                "data-site-rise",
                "data-site-fade",
            ]) {
                expect(moving).toContain(mark);
                expect(reduce).toContain(mark);
            }
        },
    );

    it.each(LOOK_IDS)(
        "%s: rises no more than its 8px, and nothing waits for a scroll",
        (id) => {
            const sheet = craftRules(":root", undefined, id);
            const rise = block(sheet, "@keyframes site-rise");
            const px = /translateY\((-?\d+)px\)/.exec(rise)?.[1];
            expect(Math.abs(Number(px))).toBeLessThanOrEqual(
                LOOKS[id].motion.rise,
            );
            expect(LOOKS[id].motion.rise).toBeLessThanOrEqual(8);
            // Sections are visible at rest: no scroll-linked entrance, no
            // parallax.
            expect(sheet).not.toMatch(/animation-timeline|view\(\)|scroll\(/);
            expect(sheet).not.toMatch(/\[data-site-section\] > \*/);
            expect(sheet).not.toMatch(/perspective|translateZ/);
        },
    );

    it("keeps Classic's own entrance and timing exactly", () => {
        const classic = craftRules(":root", undefined);
        expect(classic).toContain("animation-timeline: view();");
        expect(classic).toContain("translateY(14px)");
        expect(classic).toContain("site-menu-in 180ms");
        expect(classic).toContain("color 150ms");
        expect(craftRules(":root", undefined, "quiet")).toContain(
            "color 140ms",
        );
    });
});

describe("the look reaches every block", () => {
    const photo = { src: "https://media.test/p.jpg", alt: "The studio" };
    const hero = (extra: Record<string, unknown> = {}) => ({
        type: "hero",
        content: { heading: "Yoga at your pace", image: photo, ...extra },
    });

    it("a section with no variant takes the look's layout", () => {
        const classic = renderToStaticMarkup(
            <PageSections sections={[hero()]} />,
        );
        const quiet = renderToStaticMarkup(
            <PageSections sections={[hero()]} look="quiet" />,
        );
        // Classic splits a hero with a photo; Quiet centres it.
        expect(classic).toContain("lg:grid-cols-2");
        expect(quiet).not.toContain("lg:grid-cols-2");
    });

    it("a section's own variant beats the look", () => {
        const own = hero({ variant: "split" });
        expect(withLookVariant(own, "quiet")).toBe(own.content);
        expect(
            renderToStaticMarkup(
                <PageSections sections={[own]} look="quiet" />,
            ),
        ).toContain("lg:grid-cols-2");
    });

    it("a Folio hero with no photo keeps the no-photo layout", () => {
        const bare = { type: "hero", content: { heading: "Yoga" } };
        expect(withLookVariant(bare, "folio")).toBe(bare.content);
        expect(
            renderToStaticMarkup(
                <PageSections sections={[bare]} look="folio" />,
            ),
        ).not.toContain("<img");
    });

    it("Classic's content is handed on untouched, the same object", () => {
        const section = hero();
        expect(withLookVariant(section, undefined)).toBe(section.content);
        expect(withLookVariant({ type: "nope", content: {} }, "quiet")).toEqual(
            {},
        );
    });

    it("the header lies over a full-bleed hero the look chose too", () => {
        const section = hero();
        expect(opensOverPhoto(section)).toBe(false);
        expect(opensOverPhoto(hero({ variant: "fullBleed" }), "quiet")).toBe(
            true,
        );
    });

    it("hands every block the look and whether this is the owner's preview", () => {
        // The props reach the block: a renderer test of one that reads them
        // is the later units'; here, that drawing with them never throws and
        // draws the same markup for blocks that do not yet use them.
        const sections = [
            { type: "faq", content: { items: [{ q: "Q", a: "A" }] } },
            {
                type: "richText",
                content: { format: "html", value: "<p>x</p>" },
            },
        ];
        for (const s of sections) {
            const plain = renderToStaticMarkup(<SectionRenderer section={s} />);
            for (const look of [...LOOK_IDS, undefined] as (
                LookId | undefined
            )[]) {
                for (const owner of [true, false]) {
                    expect(
                        renderToStaticMarkup(
                            <SectionRenderer
                                section={s}
                                look={look}
                                isOwnerPreview={owner}
                            />,
                        ),
                    ).toBe(plain);
                }
            }
        }
    });
});

describe("the states every look shares (U15)", () => {
    it.each(LOOK_IDS)(
        "%s: loading shapes wait 300ms and then stay still; the banner lifts the page",
        (look) => {
            const sheet = css(look);
            expect(HELD_AFTER_MS).toBe(300);
            expect(sheet).toContain(`animation-delay: ${HELD_AFTER_MS}ms`);
            expect(sheet).toMatch(
                /@keyframes site-held\s*{\s*from\s*{\s*visibility: hidden;/,
            );
            // The hold is visibility only: nothing moves, nothing loops.
            const held = sheet.slice(sheet.indexOf("@keyframes site-held"));
            expect(held.slice(0, held.indexOf("}") + 1)).not.toMatch(
                /transform|opacity/,
            );
            expect(sheet).toMatch(/\[data-times-loading\]/);
            expect(sheet).toMatch(/\[data-services-loading\]/);
            // A live fact's true fallback is never held back.
            expect(sheet).toContain('[aria-busy="true"]:not([data-live-fact])');
            // No shimmer: the pulse is stopped before the hold is set.
            expect(sheet.indexOf(".animate-pulse")).toBeLessThan(
                sheet.indexOf("animation-name: site-held"),
            );
            expect(sheet).toContain(
                "padding-bottom: var(--site-consent-offset, 0px)",
            );
        },
    );

    it("Classic has none of them", () => {
        const sheet = css(undefined);
        expect(sheet).not.toContain("site-held");
        expect(sheet).not.toContain("--site-consent-offset");
    });
});
