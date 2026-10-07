/**
 * The merchant's token layer (#189, moved here by #252).
 *
 * These variables ARE the separation between Saroh's brand and a merchant's
 * site. `apps/saroh.app/tailwind.config.ts` was the only place the `site.*`
 * colour namespace existed, which is why the editor's preview could not write
 * the same classes the live renderer writes and reached for
 * `bg-[hsl(var(--site-bg))]` instead. Two files drawing the same thing in two
 * notations, because only one of them had the vocabulary. Moving the blocks
 * without moving this would have let them drift apart again the same way.
 */

import type { SiteFontPair } from "@saroh/block-contract";
import { findFontPair, fontStack } from "@saroh/block-contract";

import { SITE_FONT_STACK } from "./tailwind-preset";

/**
 * The faces an app has loaded, by Google Fonts family name ("Fraunces"), each
 * mapped to the CSS family its loader registered — `next/font` hashes it, so
 * the plain name would not find the file. `saroh.app` loads them
 * (`lib/site-fonts.ts`), and the editor for its previews; anywhere without
 * them a pair falls back to the plain family name and then to its stack.
 */
export type LoadedSiteFaces = Readonly<Record<string, string>>;

/** The `--site-font-*` variables, and the role each one sets. */
const FONT_ROLES: Partial<
    Record<string, keyof Pick<SiteFontPair, "heading" | "body" | "mono">>
> = {
    "--site-font-heading": "heading",
    "--site-font-body": "body",
    // The optional third face (`font-site-mono`): absent for a pair without
    // one, which then sets machine facts in its body face.
    "--site-font-mono": "mono",
};

/**
 * A loader's registered family, if it is one a stylesheet can safely carry:
 * quoted or bare names, commas and spaces. It comes from the app's own build,
 * never from a snapshot, but it is interpolated into a `<style>` element, so
 * it is checked like everything else written there.
 */
function safeLoadedFamily(
    faces: LoadedSiteFaces | undefined,
    family: string | null,
): string | undefined {
    if (!faces || family === null) return undefined;
    const loaded = faces[family];
    return typeof loaded === "string" && /^[\w '",-]{1,200}$/.test(loaded)
        ? loaded
        : undefined;
}

/**
 * The `font-family` stacks for a pair's key (KTD-2), or null for a key that is
 * not in the list. The snapshot carries only the KEY; this is where it becomes
 * CSS, from the curated list, so nothing a publication holds is ever written
 * into a stylesheet as a font name.
 */
export function fontPairStacks(
    key: unknown,
    faces?: LoadedSiteFaces,
): { heading: string; body: string; mono?: string } | null {
    const pair = findFontPair(key);
    if (!pair) return null;
    return {
        heading: fontStack(
            pair.heading,
            safeLoadedFamily(faces, pair.heading.family),
        ),
        body: fontStack(pair.body, safeLoadedFamily(faces, pair.body.family)),
        // Only a pair that names a mono face has one.
        ...(pair.mono
            ? {
                  mono: fontStack(
                      pair.mono,
                      safeLoadedFamily(faces, pair.mono.family),
                  ),
              }
            : {}),
    };
}

/**
 * Per-publication theme (#189).
 *
 * The merchant's six colour choices and five spacing scalars, already resolved
 * into `--site-*` custom properties by the publisher and carried in the
 * snapshot. Until now this component hardcoded the stone defaults with a note
 * saying it would interpolate brand fields "once the snapshot carries them" —
 * the snapshot has carried them since #189, and the live site went on showing
 * greys no merchant chose while the editor preview showed their actual palette.
 *
 * The defaults below are still the fallback, and they matter: publications are
 * immutable, so every site published before #189 has no `styleVariables` at all
 * and must keep rendering exactly as it always has.
 *
 * Deliberately NOT Saroh's brand tokens: this subtree is the merchant's
 * website, not a Saroh surface.
 */
export function SiteTheme({
    variables,
    selector = ":root",
    faces,
}: {
    variables?: Record<string, string> | null;
    /**
     * The faces this app loaded ({@link LoadedSiteFaces}). The variables name
     * a font pair by key; this is how the key finds the files.
     */
    faces?: LoadedSiteFaces;
    /**
     * What the variables are declared on. `:root` — the default, and what the
     * live renderer and the editor preview both want — themes the whole
     * document, which is right when a document IS one merchant's site.
     *
     * The ui.saroh.in catalog is the case that needed anything else: showing
     * one block in three palettes side by side means three theme scopes on one
     * page, and `:root` can only be written once. Pass a selector (and put it
     * on a wrapper) to scope a palette to a subtree — {@link SiteThemeScope}
     * does both.
     *
     * Not a free-form string on the way to a `<style>` element by accident: it
     * is checked below, for the same reason the variable names and values are.
     */
    selector?: string;
}) {
    const custom = cssVariables(variables, faces);
    const at = safeSelector(selector);
    const labels = labelRule(at, variables?.[LABEL_STYLE_VARIABLE]);
    const column = columnRule(at, variables?.[CONTENT_WIDTH_VARIABLE]);

    return (
        <style>{`
            ${at} {
                --site-bg: 0 0% 100%;
                --site-surface: 0 0% 100%;
                --site-fg: 24 10% 10%;
                /* Body text: quieter than a heading, still readable. The
                   Tailwind config has mapped site-body since S2-006 and
                   nothing ever defined the variable, so every user of it —
                   the layout root, the 404 page, checkout — fell back to
                   near-black, which is invisible on a dark ground. */
                --site-body: 24 6% 34%;
                /* Declared in the site.* namespace since #252 and never
                   given a default here, so text-site-muted and
                   border-site-border resolved to hsl() of nothing — an invalid
                   declaration the browser drops, leaving the text at its
                   inherited colour and the border invisible. The publisher
                   DERIVES both per publication (app.saroh.in/lib/sites/style.ts),
                   so live sites were fine and only this fallback was not: the
                   tenant 404, the root error boundary, checkout, and every
                   publication older than #189 — exactly the paths that render
                   when something has already gone wrong.

                   The values are the ones siteStyleVariables() derives for the
                   default style, asserted in api's site-style.spec.ts, so a
                   publication carrying no variables renders identically to one
                   published today having chosen nothing. Picking a fresh pair
                   here would have made "never styled" and "styled by default"
                   two different-looking things. */
                --site-muted: 24 4.9% 55.9%;
                --site-border: 24 1.1% 90.1%;
                --site-accent: 24 10% 10%;
                --site-accent-fg: 0 0% 100%;
                --site-hero-bg: 0 0% 100%;
                --site-hero-fg: 24 10% 10%;
                --site-cta-bg: 24 10% 10%;
                --site-cta-fg: 0 0% 98%;
                --site-footer-bg: 24 10% 10%;
                --site-footer-fg: 0 0% 98%;
                --site-page-margin: 38px;
                --site-section-padding: 52px;
                --site-grid-gap: 14px;
                --site-radius: 2px;
                --site-heading-scale: 1;
                /* The merchant's type (H1). Every publication, old and new,
                   is set in the neutral system stack until its merchant
                   chooses fonts: no publication carries a font variable yet,
                   so these are what every site renders with. Never one of
                   Saroh's own faces (gate G7). */
                --site-font-heading: ${SITE_FONT_STACK};
                --site-font-body: ${SITE_FONT_STACK};
            }
${
    custom === null
        ? /*
           * The OS dark preference applies ONLY to an unstyled site.
           *
           * A merchant who chose a paper ground chose it for everyone; flipping
           * their storefront to black because a visitor's laptop is in dark
           * mode overrides a decision they made deliberately, and it is not a
           * decision this app is entitled to make on their behalf. Sites with
           * no palette keep the old behaviour, which is what they have always
           * had.
           */
          `            @media (prefers-color-scheme: dark) {
                ${at} {
                    --site-bg: 0 0% 0%;
                    --site-surface: 24 6% 10%;
                    --site-fg: 0 0% 100%;
                    --site-body: 0 0% 78%;
                    --site-accent: 0 0% 100%;
                    --site-accent-fg: 24 10% 10%;
                    --site-hero-bg: 24 6% 10%;
                    --site-hero-fg: 0 0% 100%;
                    --site-cta-bg: 0 0% 100%;
                    --site-cta-fg: 24 10% 10%;
                    --site-footer-bg: 24 6% 10%;
                    --site-footer-fg: 0 0% 100%;
                }
            }`
        : `            ${at} {\n${custom}\n            }`
}${labels}${column}${sectionRules(at)}
        `}</style>
    );
}

/**
 * The section-title style a template set (DEC-090), by WORD
 * (`--site-label-style`, from `typeScaleVariables`). Like a font pair's key,
 * the value is never written into CSS: it picks one of the fixed rules below.
 */
const LABEL_STYLE_VARIABLE = "--site-label-style";

/**
 * Section titles as an eyebrow: small, uppercase, wide-tracked, in the quiet
 * text colour or the accent — both held to 4.5:1 on the page by the
 * palette's rules. Blocks mark a section title `data-site-title`; the
 * selector's two parts outrank the title's own size and colour utilities, so
 * a site without a label style keeps the headings it has.
 *
 * A text block's own `h2`s and `h3`s join them when it asks
 * (`headingStyle: "label"`, marked `data-site-headings` on its prose): the
 * sanitized markup cannot carry the attribute itself.
 */
const LABEL_RULES: Record<string, string> = {
    eyebrow: "hsl(var(--site-muted))",
    eyebrowAccent: "hsl(var(--site-accent))",
};

function labelRule(at: string, style: string | undefined): string {
    const colour = style ? LABEL_RULES[style] : undefined;
    if (!colour) return "";
    return `
            ${at} :is([data-site-title], [data-site-headings="label"] :is(h2, h3)) {
                font-size: 0.875rem;
                line-height: 1.4;
                font-weight: 500;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: ${colour};
            }`;
}

/** A template's column width (DEC-090 type scale), in px. */
const CONTENT_WIDTH_VARIABLE = "--site-content-width";

/**
 * One column for the whole page, when a template sets one.
 *
 * The header, the footer and a module page's title read the width through
 * `max-w-site-content`. The blocks still name their own Tailwind widths
 * (1280px, or a 768px reading column for text), so while the site has a
 * column this rule sets each of those, inside a section, to it — a
 * developer's single 820px column, a studio's 1320px frame. Without one the
 * rule is not written, and every block keeps the width it has always had.
 * Margins are inside the width, as they are inside `max-w-screen-xl`.
 */
function columnRule(at: string, width: string | undefined): string {
    if (!width || !/^\d{3,4}px$/.test(width)) return "";
    return `
            ${at} [data-site-section] :is(.max-w-screen-md, .max-w-screen-lg, .max-w-screen-xl) {
                max-width: var(${CONTENT_WIDTH_VARIABLE});
            }`;
}

/**
 * What a section's frame asks of the page (`section-frame.ts` in the
 * contract), written for every site because each only matches a section
 * that set it, and none has until a template or the merchant does.
 *
 * BANDS. A band recolours the section's own `--site-*` tokens, so every
 * block inside it draws in the band's colours without knowing it is in one.
 * The swap reads the page's colours through `--site-band-*` aliases
 * declared at the theme's own scope: a property cannot read its own
 * inherited value on the element that redefines it, but an alias, computed
 * where the theme is, carries the page's value down. Each band keeps a
 * pairing the palette already holds to 4.5:1 — ink on paper swapped, the
 * accent's text on the accent — and every quieter text role (body, quiet,
 * hairline) takes that same full-contrast colour, never a tint nobody
 * checked. The accent inside an inverse band is the paper, so a button there
 * is paper with ink words; inside an accent band, the accent's own text.
 *
 * Anchors leave room for the sticky header when a link jumps to them.
 *
 * STATUS. The "open now" dot's colours (`--site-status`, and
 * `--site-status-inverse` over the ink) are optional palette roles, unset
 * unless a template's colourway names them; the blocks fall back to the
 * accent. An inverse band swaps the two, so the dot keeps the colour held
 * to 3:1 on the ink; an accent band clears both, so the dot is the
 * accent's text there, as every other mark in it is. An unset status stays
 * unset through a band (`var()` of nothing is nothing), and the dot keeps
 * the band's accent, as it always did.
 *
 * DEFINITION LISTS. A text block may carry `dl`/`dt`/`dd` (facts: "Clay /
 * Stoneware"). The prose defaults would set them in the typography
 * plugin's greys; this sets them in the merchant's colours, terms in the
 * heading face. Scoped to sections, so a footer's own colours stay its own.
 * A text block that asks for `factsStyle: "labels"` (marked
 * `data-site-facts`) sets its terms as small uppercase labels in the quiet
 * text colour — held to 4.5:1 on the page — and its values in the text
 * colour, the facts list the ceramics design draws.
 */
function sectionRules(at: string): string {
    return `
            ${at} {
                --site-band-paper: var(--site-bg);
                --site-band-ink: var(--site-fg);
                --site-band-card: var(--site-surface);
                --site-band-accent: var(--site-accent);
                --site-band-accent-fg: var(--site-accent-fg);
                --site-band-status: var(--site-status);
                --site-band-status-inverse: var(--site-status-inverse);
            }
            ${at} [data-site-band] {
                background-color: hsl(var(--site-bg));
                color: hsl(var(--site-body));
            }
            ${at} [data-site-band="surface"] {
                --site-bg: var(--site-band-card);
                --site-surface: var(--site-band-paper);
            }
            ${at} [data-site-band="inverse"] {
                --site-bg: var(--site-band-ink);
                --site-surface: var(--site-band-ink);
                --site-fg: var(--site-band-paper);
                --site-body: var(--site-band-paper);
                --site-muted: var(--site-band-paper);
                --site-border: var(--site-band-paper);
                --site-accent: var(--site-band-paper);
                --site-accent-fg: var(--site-band-ink);
                --site-status: var(--site-band-status-inverse);
                --site-status-inverse: var(--site-band-status);
            }
            ${at} [data-site-band="accent"] {
                --site-bg: var(--site-band-accent);
                --site-surface: var(--site-band-accent);
                --site-fg: var(--site-band-accent-fg);
                --site-body: var(--site-band-accent-fg);
                --site-muted: var(--site-band-accent-fg);
                --site-border: var(--site-band-accent-fg);
                --site-accent: var(--site-band-accent-fg);
                --site-accent-fg: var(--site-band-accent);
                --site-status: initial;
                --site-status-inverse: initial;
            }
            ${at} [data-site-section][id] {
                scroll-margin-top: 4.5rem;
            }
            ${at} [data-site-section] .prose dt {
                color: hsl(var(--site-fg));
                font-family: var(--site-font-heading);
            }
            ${at} [data-site-section] .prose dd {
                color: hsl(var(--site-fg) / 0.8);
            }
            ${at} [data-site-section] [data-site-facts="labels"] dt {
                margin-top: 1.25em;
                color: hsl(var(--site-muted));
                font-family: var(--site-font-body);
                font-size: 0.78rem;
                font-weight: 500;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }
            ${at} [data-site-section] [data-site-facts="labels"] dd {
                margin-top: 0.25em;
                padding-inline-start: 0;
                color: hsl(var(--site-fg));
            }`;
}

/**
 * A selector safe to interpolate into a `<style>` element.
 *
 * Same reasoning as `cssVariables` below: everything written into that element
 * is checked, not trusted, because a rule that holds only while every caller
 * stays well-behaved is not a rule. Allows `:root`, a class, an id, and an
 * attribute selector — which is every shape a theme scope needs and nothing
 * that can close the block and start writing rules of its own.
 *
 * An unrecognised selector falls back to `:root` rather than throwing: a
 * mis-scoped theme is a visual bug on one page, and an exception here would
 * take down the whole document.
 */
function safeSelector(selector: string): string {
    return /^(:root|[.#][A-Za-z_][\w-]*|\[[a-z-]+(="[\w-]+")?\])$/.test(
        selector,
    )
        ? selector
        : ":root";
}

/**
 * Render a snapshot's style variables as CSS declarations, or null when there
 * are none worth writing.
 *
 * Both the name and the value are checked against a tight allowlist before
 * being interpolated. The values come from our own publisher and are resolved
 * from a curated palette, so nothing hostile is expected here — but this is
 * string interpolation into a `<style>` element, and a rule that only holds as
 * long as every upstream writer stays well-behaved is not a rule. A property
 * that fails the check is dropped, so a bad value costs its own colour rather
 * than the whole stylesheet.
 */
function cssVariables(
    variables: Record<string, string> | null | undefined,
    faces?: LoadedSiteFaces,
): string | null {
    if (!variables) return null;
    const safeName = /^--site-[a-z-]+$/;
    // HSL triples ("18 45% 45%"), lengths ("38px", "64ch") and bare scales
    // ("1.05"). A template's exact colours (DEC-090) arrive as HSL triples
    // too — the publisher converts its `#RRGGBB` — so no `#` is ever let in.
    const safeValue = /^[a-zA-Z0-9 .%]{1,64}$/;

    const declarations = Object.entries(variables)
        // A word that chooses a rule, not a value (see `labelRule`).
        .filter(([name]) => name !== LABEL_STYLE_VARIABLE)
        .map(([name, value]): [string, unknown] => {
            // The two font variables carry a pair's KEY (KTD-2), translated
            // here from the curated list; an unknown key is dropped, leaving
            // the system stack. The value itself is never written.
            const role = FONT_ROLES[name];
            if (role) {
                return [name, fontPairStacks(value, faces)?.[role] ?? ""];
            }
            return [name, value];
        })
        .filter(
            (entry): entry is [string, string] =>
                safeName.test(entry[0]) &&
                typeof entry[1] === "string" &&
                (FONT_ROLES[entry[0]]
                    ? entry[1] !== ""
                    : safeValue.test(entry[1])),
        )
        .map(([name, value]) => `                ${name}: ${value};`);

    return declarations.length > 0 ? declarations.join("\n") : null;
}

/**
 * One merchant palette, scoped to what it wraps.
 *
 * For the catalog, where several palettes share a page and `:root` can only be
 * written once. The live renderer and the editor preview do NOT use this —
 * they each render one site per document, where `:root` is both correct and
 * what they have always emitted.
 */
export function SiteThemeScope({
    variables,
    name,
    faces,
    children,
}: {
    variables?: Record<string, string> | null;
    faces?: LoadedSiteFaces;
    /** Distinguishes this scope from the others on the page. */
    name: string;
    children: React.ReactNode;
}) {
    const scope = `site-theme-${name.replace(/[^\w-]/g, "")}`;
    return (
        <div className={scope}>
            <SiteTheme
                variables={variables}
                selector={`.${scope}`}
                faces={faces}
            />
            {children}
        </div>
    );
}
