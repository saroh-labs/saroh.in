/**
 * The craft layer: what makes every block on a merchant's site look
 * considered, written once by `SiteTheme` beside the tokens it sets.
 *
 * WHY HERE AND NOT IN EACH BLOCK. Twenty blocks each set their own type and
 * spacing, and what none of them set fell to the browser: an unbalanced
 * heading, a paragraph 90 characters wide, a list in the typography
 * plugin's greys, a link with no focus ring, sections all the same distance
 * apart. These rules are the floor under all of them. Each is written so a
 * block's own utility class still wins (see SPECIFICITY), so a block that
 * has chosen something keeps it.
 *
 * Drawn from the `--site-*` layer only: no colour of its own, so every rule
 * follows the merchant's palette, into a band and out of it.
 *
 * SPECIFICITY. A base rule is written `:where(<scope>) h2`, which weighs as
 * one element: more than Tailwind's reset (it comes later in the page),
 * less than any utility class. The focus rule is `:where(…) :where(a,
 * button):focus-visible`, one pseudo-class, which is less than a
 * `focus-visible:` utility's two, so a control with a designed ring keeps
 * it and shows no second one. Rules that must outrank a utility (the
 * rhythm, the reading column, the text block's lists) name their scope
 * outright.
 *
 * SCOPE. The site's own surfaces carry a mark: a section's wrapper
 * (`data-site-section`), the header and footer (`data-site-header`,
 * `data-site-footer`), and a page the site draws around no block
 * (`data-site-page`: its not-found and error pages). Nothing here reaches
 * anything else on the document, so a surface Saroh draws on a merchant's
 * address (the test release bar) is untouched.
 */

import type { LookId, LookMotion } from "@saroh/block-contract";
import { LOOKS } from "@saroh/block-contract";

/** A value read from the variables a publication carries. */
type Variables = Record<string, string> | null | undefined;

/**
 * One curve for everything that moves on a site: off quickly, settling
 * slowly, never past its mark. Durations stay short (150 to 200ms).
 */
export const SITE_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * How many characters a line of running text holds when the site sets no
 * measure of its own (a template's type scale, DEC-090): inside the 45 to
 * 75 a line should hold. `ch` is the width of a "0", wider than the average
 * letter, so 62ch reads as about 70 characters.
 */
const DEFAULT_MEASURE = "62ch";

/**
 * A block's root as it carries the page's section padding: the class every
 * block writes on its outermost element. Matched by its text, so the
 * rhythm reaches exactly the elements that have that padding and no other.
 */
const PADDED = '[class*="py-[var(--site-section-padding)]"]';

/** How a banded section's own padding and a neighbour's gap are scaled. */
const BAND_SPACE = 1.2;
const NEIGHBOUR_SPACE = 0.5;

/**
 * The craft rules for a site. `look` (DEC-172) changes only how things
 * move (`lookMotion`, KD5); with none, Classic's rules are written exactly
 * as they always were (the `classic-pin` snapshots hold that).
 */
export function craftRules(
    at: string,
    variables: Variables,
    look?: LookId,
): string {
    const scope = `${at} :is([data-site-section], [data-site-header], [data-site-footer], [data-site-page])`;
    const base = `:where(${scope})`;
    const moves = look ? LOOKS[look].motion : null;
    return [
        tokens(at),
        typography(at, base, variables),
        rhythm(at),
        states(at, moves ? `${moves.base}ms` : "150ms"),
        moves ? lookMotion(at, moves) : motion(at),
    ].join("");
}

/**
 * The layer's own tokens. `--site-section-space` carries the page's section
 * padding down as a plain value, so a section can set its own padding from
 * it: a property cannot read its own inherited value on the element that
 * redefines it (the band aliases in `site-theme.tsx` work the same way).
 */
function tokens(at: string): string {
    return `
            ${at} {
                --site-ease: ${SITE_EASE};
                --site-section-space: var(--site-section-padding);
            }`;
}

/**
 * TYPE.
 *
 * - Headings take the site's heading face, balanced lines, and tracking
 *   drawn in more the larger the heading is, with leading to match. A block
 *   that sets any of these keeps its own.
 * - Paragraphs avoid a last line of one word.
 * - THE READING COLUMN. A text block's centred column was 768px, about 90
 *   characters of running text. Where the site sets no measure and no
 *   column of its own, it is held to the default measure; a template's own
 *   measure or column is left exactly as it draws.
 * - A TEXT BLOCK'S OWN MARKUP (lists, quotes, links, rules, tables) is set
 *   through the typography plugin's own variables, pointed at the site's
 *   tokens: markers and captions in the quiet colour, a quote ruled in the
 *   accent and upright, hairlines in the border colour. A link is the
 *   accent, underlined so colour is not the only sign, and the line
 *   thickens under the pointer. Scoped to sections, so a footer's own
 *   colours stay its own.
 * - Text selected with the pointer takes the accent and its own text
 *   colour, a pairing the palette holds to 4.5:1; on the bands that paint
 *   their own ground, that ground's own pair.
 */
function typography(at: string, base: string, variables: Variables): string {
    const ownMeasure = Boolean(variables?.["--site-measure"]);
    const ownColumn = Boolean(variables?.["--site-content-width"]);
    const column =
        ownMeasure || ownColumn
            ? ""
            : `
            ${at} [data-site-section] > .max-w-screen-md {
                max-width: calc(${DEFAULT_MEASURE} + 2 * var(--site-page-margin));
            }`;
    return `
            ${base} :is(h1, h2, h3, h4) {
                font-family: var(--site-font-heading);
                text-wrap: balance;
            }
            ${base} h1 {
                letter-spacing: -0.03em;
                line-height: 1.05;
            }
            ${base} h2 {
                letter-spacing: -0.02em;
                line-height: 1.15;
            }
            ${base} :is(h3, h4) {
                letter-spacing: -0.01em;
                line-height: 1.25;
            }
            ${base} p {
                text-wrap: pretty;
            }${column}
            ${at} [data-site-section] .prose {
                --tw-prose-body: hsl(var(--site-body));
                --tw-prose-headings: hsl(var(--site-fg));
                --tw-prose-lead: hsl(var(--site-fg));
                --tw-prose-links: hsl(var(--site-accent));
                --tw-prose-bold: hsl(var(--site-fg));
                --tw-prose-counters: hsl(var(--site-muted));
                --tw-prose-bullets: hsl(var(--site-muted));
                --tw-prose-hr: hsl(var(--site-border));
                --tw-prose-quotes: hsl(var(--site-fg));
                --tw-prose-quote-borders: hsl(var(--site-accent));
                --tw-prose-captions: hsl(var(--site-muted));
                --tw-prose-code: hsl(var(--site-fg));
                --tw-prose-th-borders: hsl(var(--site-border));
                --tw-prose-td-borders: hsl(var(--site-border));
            }
            ${at} [data-site-section] .prose blockquote {
                border-inline-start-width: 2px;
                font-style: normal;
                font-weight: 500;
                quotes: none;
            }
            ${at} [data-site-section] .prose blockquote p::before,
            ${at} [data-site-section] .prose blockquote p::after {
                content: none;
            }
            ${at} [data-site-section] .prose a {
                text-decoration-line: underline;
                text-decoration-thickness: 1px;
                text-underline-offset: 0.2em;
            }
            ${at} [data-site-section] .prose a:hover {
                text-decoration-thickness: 2px;
            }
            ${at} ::selection {
                background-color: hsl(var(--site-accent));
                color: hsl(var(--site-accent-fg));
            }
            ${at} [data-site-ground="hero"] ::selection {
                background-color: hsl(var(--site-hero-fg));
                color: hsl(var(--site-hero-bg));
            }
            ${at} [data-site-ground="cta"] ::selection {
                background-color: hsl(var(--site-cta-fg));
                color: hsl(var(--site-cta-bg));
            }
            ${at} [data-site-footer] ::selection {
                background-color: hsl(var(--site-footer-fg));
                color: hsl(var(--site-footer-bg));
            }`;
}

/**
 * RHYTHM. Every section used to sit the same distance from the next, so a
 * page read as a list of equal things. Two rules vary it, both multiples of
 * the merchant's own Section padding, so the Style slider still moves the
 * whole page and a section's own padding override still wins (it is set on
 * the wrapper itself, which outranks a rule):
 *
 * - A BANDED section (surface, inverse, accent) is a room of its own, and
 *   takes a little more padding inside its colour.
 * - Two PLAIN sections in a row share one ground, so the second starts
 *   half a padding down instead of a whole one: they read as neighbours.
 *   Not after a block that paints its own ground (the hero, the closing
 *   band: `data-site-ground`), and never applied to one: its padding is
 *   inside its colour.
 *
 * The second rule only ever makes a gap smaller: it matches a block's root
 * by the padding class every block's root carries (`PADDED`), so a root
 * with no padding of its own is never given any, and it does not count a
 * section that drew nothing (an empty wrapper) as a neighbour.
 *
 * A browser without `:has()` skips the second rule and keeps even gaps.
 */
function rhythm(at: string): string {
    return `
            ${at} [data-site-section][data-site-band] {
                --site-section-padding: calc(var(--site-section-space) * ${BAND_SPACE});
            }
            ${at} [data-site-section]:not([data-site-band]):not(:empty):not(:has(> [data-site-ground])) + [data-site-section]:not([data-site-band]) > ${PADDED}:not([data-site-ground]) {
                padding-top: calc(var(--site-section-padding) * ${NEIGHBOUR_SPACE});
            }`;
}

/**
 * STATES, for every link and button on the site's own surfaces that has
 * not designed its own.
 *
 * - FOCUS: a 2px outline, 2px off the control, in the ground's own text
 *   colour: the page's ink in a section and the header (swapped with the
 *   ground inside a band, since a band recolours the token), the hero's,
 *   the closing band's and the footer's own inside each, and the page's
 *   paper over a full-bleed hero's wash, which is its ink. Every one of
 *   those is held to 4.5:1 on its ground by the palette, well over the 3:1
 *   a focus mark needs, so it shows on every colourway. Only on
 *   `:focus-visible`: a press with a pointer draws none.
 * - A control that is disabled takes no pointer.
 * - Colour, opacity and underline changes ease over 150ms rather than
 *   snapping, for a visitor who has not asked for less motion.
 *
 * Hover and pressed looks belong to each control; the shared ones are
 * `ctaClasses` and the header's and footer's own.
 */
function states(at: string, duration: string): string {
    const within = (mark: string) =>
        `:where(${at} ${mark}) :where(a, button, summary):focus-visible`;
    return `
            ${within(":is([data-site-section], [data-site-header], [data-site-page])")} {
                outline: 2px solid hsl(var(--site-fg));
                outline-offset: 2px;
            }
            ${within('[data-site-ground="hero"]')} {
                outline-color: hsl(var(--site-hero-fg));
            }
            ${within('[data-site-ground="cta"]')} {
                outline-color: hsl(var(--site-cta-fg));
            }
            ${within('[data-site-ground="photo"]')} {
                outline-color: hsl(var(--site-bg));
            }
            ${within("[data-site-footer]")} {
                outline: 2px solid hsl(var(--site-footer-fg));
                outline-offset: 2px;
            }
            :where(${at} :is([data-site-section], [data-site-header], [data-site-footer], [data-site-page])) :where(button:disabled, [aria-disabled="true"]) {
                cursor: default;
            }
            @media (prefers-reduced-motion: no-preference) {
                :where(${at} :is([data-site-section], [data-site-header], [data-site-footer], [data-site-page])) :where(a, button, summary) {
                    transition: color ${duration} var(--site-ease), background-color ${duration} var(--site-ease), border-color ${duration} var(--site-ease), opacity ${duration} var(--site-ease), text-decoration-color ${duration} var(--site-ease);
                }
            }`;
}

/**
 * MOTION. Small, and only for a visitor who has not asked for less.
 *
 * - The phone menu's panel drops in over 180ms and the page dims behind it.
 * - A SECTION RISES A LITTLE AS IT COMES INTO VIEW, tied to the scroll
 *   itself (`animation-timeline: view()`), with no script. That matters:
 *   the content is in the page's HTML and fully visible with scripts off,
 *   to a crawler, in print, and in any browser that does not know scroll
 *   timelines (the whole rule sits behind `@supports`, which asks for the
 *   exact range it uses, and such a browser simply shows the section: a
 *   range it misread would fade a section across the whole screen). What
 *   is already on screen when the page
 *   loads is past its entrance and is never hidden, so the page's first
 *   paint is not delayed.
 * - Once a section has come in, the animation lets go of it completely
 *   (it fills backwards only), so it leaves no transform or stacking
 *   context behind for a sheet or a menu inside the section to be caught
 *   by.
 * - Only on a real site's document (`:root`). A scoped theme is the
 *   editor's canvas or a catalog tile, where a section fading in as the
 *   merchant scrolls their own work would be noise.
 *
 * Transform and opacity only; nothing moves the layout.
 */
function motion(at: string): string {
    const entrance =
        at === ":root"
            ? `
            @media screen and (prefers-reduced-motion: no-preference) {
                @supports (animation-timeline: view()) and (animation-range: entry 0% entry 180px) {
                    ${at} [data-site-section] > * {
                        animation: site-rise var(--site-ease) backwards;
                        animation-timeline: view();
                        animation-range: entry 0% entry 180px;
                    }
                }
            }`
            : "";
    return `
            @keyframes site-rise {
                from {
                    opacity: 0;
                    transform: translateY(14px);
                }
            }
            @keyframes site-menu-in {
                from {
                    opacity: 0;
                    transform: translateY(-6px);
                }
            }
            @keyframes site-fade-in {
                from {
                    opacity: 0;
                }
            }
            @media (prefers-reduced-motion: no-preference) {
                ${at} [data-site-menu-panel] {
                    animation: site-menu-in 180ms var(--site-ease) both;
                }
                ${at} [data-site-menu-scrim] {
                    animation: site-fade-in 180ms var(--site-ease) both;
                }
            }${entrance}`;
}

/**
 * MOTION UNDER A LOOK (DEC-172, KD5, R5): fade or rise, 200ms or less, no
 * bounce, no loops, and reduced motion respected. The boards' longer
 * moments (a hero unmasking, a frame drawing, a ticket springing) are cut
 * or shortened to fit; where a board and DEC-172 disagree, DEC-172 wins.
 *
 * - NOTHING MOVES ON SCROLL. Classic's sections rise as they come into
 *   view; under a look every section is visible at rest, never hidden
 *   waiting for a scroll (WV2Motion, WV2Tech: screen readers and captures
 *   met blanks). No parallax.
 * - `site-rise` is a fade and a rise of the look's distance (8px) over
 *   its slow step (200ms); `site-fade-in` is a fade alone. A block asks
 *   for either by marking an element `data-site-rise` or `data-site-fade`
 *   (a sheet, a step, the booked ticket): it plays once, as the element
 *   appears, and lets go of it afterwards.
 * - The phone menu and its scrim come in over the slow step.
 * - Links and buttons ease their colours over the base step (140ms,
 *   `states`).
 * - REDUCED MOTION: every animation becomes a fade, over the fast step
 *   plus a little (120ms): nothing moves across the screen.
 *
 * One curve, `--site-ease`, which never passes its mark (no value over 1).
 */
function lookMotion(at: string, m: LookMotion): string {
    const fade = 120;
    return `
            @keyframes site-rise {
                from {
                    opacity: 0;
                    transform: translateY(${m.rise}px);
                }
            }
            @keyframes site-menu-in {
                from {
                    opacity: 0;
                    transform: translateY(-${Math.min(m.rise, 6)}px);
                }
            }
            @keyframes site-fade-in {
                from {
                    opacity: 0;
                }
            }
            @media (prefers-reduced-motion: no-preference) {
                ${at} [data-site-menu-panel] {
                    animation: site-menu-in ${m.slow}ms var(--site-ease) both;
                }
                ${at} [data-site-menu-scrim] {
                    animation: site-fade-in ${m.slow}ms var(--site-ease) both;
                }
                ${at} [data-site-rise] {
                    animation: site-rise ${m.slow}ms var(--site-ease) backwards;
                }
                ${at} [data-site-fade] {
                    animation: site-fade-in ${m.base}ms var(--site-ease) backwards;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                ${at} :is([data-site-menu-panel], [data-site-menu-scrim]) {
                    animation: site-fade-in ${fade}ms var(--site-ease) both;
                }
                ${at} :is([data-site-rise], [data-site-fade]) {
                    animation: site-fade-in ${fade}ms var(--site-ease) backwards;
                }
            }`;
}
