/**
 * The typefaces a merchant's site may be set in (industry templates, KTD-2).
 *
 * A curated list of PAIRS, not free font strings: `Site.style.fontPair` holds
 * one of these keys, the API refuses anything else, and the renderer turns the
 * key into faces it loads itself. No font name a client sent ever reaches a
 * stylesheet.
 *
 * Lives here because this is the package both sides already share: the API
 * reaches it through `@saroh/templates`, the renderer and the editor through
 * `@saroh/site-blocks`. Pure data, no React and no `next/font`: loading is the
 * renderer's job (`apps/saroh.app/lib/site-fonts.ts`), which must call each
 * `next/font/google` loader with literal options and so cannot read this list.
 * A test there holds the two in step.
 *
 * Never Saroh's brand by default. `system` is the neutral stack every site has
 * always had (H1), and a pair is only ever a merchant's (or their template's)
 * choice.
 */

/**
 * The neutral system stack a site is set in until it chooses a pair. Kept
 * identical to `SITE_FONT_STACK` in `@saroh/site-blocks` (a test there says
 * so): that one feeds Tailwind configs, which must not load a built package.
 */
export const SYSTEM_FONT_STACK =
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

// Each fallback names a Devanagari face (DEC-046), so a Hindi line finds real
// letters where the device has them, whatever the pair.
const SERIF_FALLBACK =
    'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Devanagari", serif';
const MONO_FALLBACK =
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Noto Sans Devanagari", monospace';

/** One role's face: the family loaded for it and what stands in meanwhile. */
export interface SiteFontFace {
    /** The Google Fonts family name, or null for the system stack. */
    family: string | null;
    /** Weights the renderer loads; empty for a variable font's full range. */
    weights: readonly number[];
    /** The stack after the family: shown while it loads, or if it can't. */
    fallback: string;
    /** Styles the renderer loads; absent for upright only. */
    styles?: readonly FontStyleName[];
    /** Character sets the renderer loads; absent for `latin` only. */
    subsets?: readonly FontSubset[];
    /**
     * A variable font's extra axes, beyond weight (Live's width, Folio's
     * optical size). A face with axes loads its full weight range, so its
     * `weights` are empty: `next/font` takes an axis only that way.
     */
    axes?: readonly string[];
    /**
     * The name the app's loaded faces file this face under, when it is not
     * the family's: a look loads its own copy of a family with only the
     * weights it sets (Newsreader for Folio beside the full `newsreader`
     * pair), so the two need different keys. Absent: the family name.
     */
    load?: string;
}

export type FontStyleName = "normal" | "italic";
/**
 * `latin-ext` carries the rupee sign (U+20B9) in the faces that draw one; a
 * browser fetches that file only for a page that has such a character.
 */
export type FontSubset = "latin" | "latin-ext";

/**
 * A heading face and a body face, chosen together, and sometimes a third.
 *
 * `mono` is an optional ACCENT role for small machine facts — a handle, a
 * year, a stack, a class time — never paragraphs. Blocks reach it through
 * `font-site-mono`, which falls back to the body face, so a pair without one
 * sets those facts exactly as it sets everything else.
 */
export interface SiteFontPair {
    key: string;
    /** What a merchant reads in Website › Style, in plain words. */
    name: string;
    heading: SiteFontFace;
    body: SiteFontFace;
    mono?: SiteFontFace;
    /**
     * A look's pair (DEC-172): set by the site's look, never chosen on its
     * own. Its faces load only the weights the look's type sets, so the
     * Typeface picker does not offer it to a Classic site, whose headings
     * would ask for weights it never loaded.
     */
    look?: true;
}

const face = (
    family: string | null,
    fallback: string,
    weights: readonly number[] = [],
): SiteFontFace => ({ family, weights, fallback });

/**
 * A look's face (DEC-172, U3): its own loader, filed under `load`, with the
 * weights, styles and subsets named, so a variable font never loads its full
 * range. Two families per look, no mono role.
 */
const lookFace = (
    load: string,
    family: string,
    fallback: string,
    weights: readonly number[],
    more: {
        styles?: readonly FontStyleName[];
        subsets?: readonly FontSubset[];
        axes?: readonly string[];
    } = {},
): SiteFontFace => ({ family, weights, fallback, load, ...more });

/** Upright and italic, for a face whose look sets italic words. */
const WITH_ITALIC: readonly FontStyleName[] = ["normal", "italic"];
/** Latin plus the set with the rupee sign, for a face that draws one. */
const WITH_RUPEE: readonly FontSubset[] = ["latin", "latin-ext"];

/**
 * The pairs, the default first. The eight template designs' pairs; more join
 * when a design needs one (the v2 layouts). Removing a key strands every site
 * that chose it on the system stack, so keys are only ever added.
 */
export const FONT_PAIRS = [
    {
        key: "system",
        name: "Your visitor's system font",
        heading: face(null, SYSTEM_FONT_STACK),
        body: face(null, SYSTEM_FONT_STACK),
    },
    {
        key: "fraunces-inter-tight",
        name: "Fraunces and Inter Tight",
        heading: face("Fraunces", SERIF_FALLBACK),
        body: face("Inter Tight", SYSTEM_FONT_STACK),
    },
    {
        key: "newsreader",
        name: "Newsreader",
        heading: face("Newsreader", SERIF_FALLBACK),
        body: face("Newsreader", SERIF_FALLBACK),
    },
    {
        key: "ibm-plex",
        name: "IBM Plex Sans and IBM Plex Mono",
        heading: face("IBM Plex Sans", SYSTEM_FONT_STACK),
        body: face("IBM Plex Mono", MONO_FALLBACK, [400, 500]),
    },
    // The gym's times and counts are set in IBM Plex Mono (U6).
    {
        key: "archivo-narrow",
        name: "Archivo Narrow and Archivo",
        heading: face("Archivo Narrow", SYSTEM_FONT_STACK),
        body: face("Archivo", SYSTEM_FONT_STACK),
        mono: face("IBM Plex Mono", MONO_FALLBACK, [400, 500]),
    },
    {
        key: "source-serif-inter",
        name: "Source Serif and Inter",
        heading: face("Source Serif 4", SERIF_FALLBACK),
        body: face("Inter", SYSTEM_FONT_STACK),
    },
    /*
     * Geist for headings AND body (the Developer design, U9), with JetBrains
     * Mono in the mono role for its small machine facts (a handle, years, a
     * stack) only. Mono as the BODY, as this pair first had it, set every
     * paragraph in a code face. Was `geist-jetbrains`; renamed before any
     * release, as keys are never renamed once a site can hold one.
     */
    {
        key: "geist",
        name: "Geist and JetBrains Mono",
        heading: face("Geist", SYSTEM_FONT_STACK),
        body: face("Geist", SYSTEM_FONT_STACK),
        mono: face("JetBrains Mono", MONO_FALLBACK),
    },
    {
        key: "archivo",
        name: "Archivo",
        heading: face("Archivo", SYSTEM_FONT_STACK),
        body: face("Archivo", SYSTEM_FONT_STACK),
    },
    /*
     * The Clinic design's (U11): Inter Tight for headings, set close and
     * sans like a clinic's signage, over Inter for reading. Both faces are
     * already loaded for other pairs, so this adds a pairing, not a font.
     */
    {
        key: "inter-tight",
        name: "Inter Tight and Inter",
        heading: face("Inter Tight", SYSTEM_FONT_STACK),
        body: face("Inter", SYSTEM_FONT_STACK),
    },
    /*
     * The looks' pairs (DEC-172, U3), one per look and keyed by its id
     * (`LOOKS[id].fontPair`). Each face loads only the weights its look's
     * type sets, upright unless it names italic:
     *
     * - Folio: Newsreader, variable with its optical size, with italics,
     *   over Hanken Grotesk 400 to 600.
     * - Quiet: Cormorant Garamond 400 and 500, Light (300) only at 48px and
     *   up, italic for its 400, over Jost 400 and 500.
     * - Live: Bricolage Grotesque, variable with its width (set at 80%),
     *   over Figtree 400 to 700.
     *
     * The display faces and Figtree draw the rupee sign in `latin-ext`, so
     * they load it; Hanken Grotesk and Jost have no rupee in any set, and a
     * price in their text takes the system face's.
     */
    {
        key: "folio",
        name: "Newsreader and Hanken Grotesk",
        look: true,
        heading: lookFace(
            "folio:heading",
            "Newsreader",
            SERIF_FALLBACK,
            // Variable, with its optical size (board VA): the display cut at
            // display sizes (DEC-172 amendment, 22 Oct).
            [],
            {
                styles: WITH_ITALIC,
                subsets: WITH_RUPEE,
                axes: ["opsz"],
            },
        ),
        body: lookFace(
            "folio:body",
            "Hanken Grotesk",
            SYSTEM_FONT_STACK,
            [400, 500, 600],
        ),
    },
    {
        key: "quiet",
        name: "Cormorant Garamond and Jost",
        look: true,
        heading: lookFace(
            "quiet:heading",
            "Cormorant Garamond",
            SERIF_FALLBACK,
            [300, 400, 500],
            { styles: WITH_ITALIC, subsets: WITH_RUPEE },
        ),
        body: lookFace("quiet:body", "Jost", SYSTEM_FONT_STACK, [400, 500]),
    },
    {
        key: "live",
        name: "Bricolage Grotesque and Figtree",
        look: true,
        heading: lookFace(
            "live:heading",
            "Bricolage Grotesque",
            SYSTEM_FONT_STACK,
            // Variable, with its width (board VB sets it at 80%; DEC-172
            // amendment, 22 Oct).
            [],
            {
                subsets: WITH_RUPEE,
                axes: ["wdth"],
            },
        ),
        body: lookFace(
            "live:body",
            "Figtree",
            SYSTEM_FONT_STACK,
            [400, 500, 600, 700],
            {
                subsets: WITH_RUPEE,
            },
        ),
    },
] as const satisfies readonly SiteFontPair[];

export type FontPairKey = (typeof FONT_PAIRS)[number]["key"];

/** The pair a site without a choice is set in: today's appearance. */
export const DEFAULT_FONT_PAIR: FontPairKey = "system";

export const FONT_PAIR_KEYS: readonly FontPairKey[] = FONT_PAIRS.map(
    (p) => p.key,
);

export function isFontPairKey(value: unknown): value is FontPairKey {
    return (
        typeof value === "string" &&
        (FONT_PAIR_KEYS as readonly string[]).includes(value)
    );
}

/** The pair for a key, or undefined for one that is not in the list. */
export function findFontPair(key: unknown): SiteFontPair | undefined {
    return FONT_PAIRS.find((p) => p.key === key);
}

/**
 * The pairs a merchant picks from in Website › Style's Typeface list: every
 * pair but a look's, which comes with its look.
 */
export const PICKABLE_FONT_PAIRS: readonly SiteFontPair[] = FONT_PAIRS.filter(
    (p: SiteFontPair) => !p.look,
);

/** The name an app files a face's loaded family under (`LoadedSiteFaces`). */
export function fontFaceKey(face: SiteFontFace): string | null {
    return face.load ?? face.family;
}

/** Every loaded-face key a pair reads, by role, mono included. */
export function fontPairFaceKeys(pair: SiteFontPair): string[] {
    return [pair.heading, pair.body, pair.mono]
        .map((f) => (f ? fontFaceKey(f) : null))
        .filter((k): k is string => typeof k === "string");
}

/**
 * A role's `font-family` value. `loaded` is the family name the renderer's
 * font loader registered (next/font hashes it); without one the plain family
 * name is used, which renders wherever that face is installed or loaded by
 * name, and falls through to the fallback everywhere else.
 */
export function fontStack(face: SiteFontFace, loaded?: string): string {
    if (face.family === null) return face.fallback;
    return `${loaded ?? `"${face.family}"`}, ${face.fallback}`;
}

/** Every family a pair loads, by role, mono included when it has one. */
export function fontPairFamilies(pair: SiteFontPair): string[] {
    return [pair.heading.family, pair.body.family, pair.mono?.family].filter(
        (f): f is string => typeof f === "string",
    );
}

/**
 * The `--site-font-*` variables a style with this pair emits: the pair's KEY
 * in each role it fills, which `SiteTheme` turns into stacks from this list
 * (KTD-2). Nothing for the default pair or a key not in the list, so a site
 * that chose nothing resolves to exactly the variables it always did; no
 * `--site-font-mono` for a pair without a mono face, which then sets its
 * facts in the body face. The API's resolver and the editor's both call
 * this, so the two cannot drift.
 */
export function fontPairVariables(key: unknown): Record<string, string> {
    const pair = findFontPair(key);
    if (!pair || pair.key === DEFAULT_FONT_PAIR) return {};
    return {
        "--site-font-heading": pair.key,
        "--site-font-body": pair.key,
        ...(pair.mono ? { "--site-font-mono": pair.key } : {}),
    };
}
