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
}

/** A heading face and a body face, chosen together. */
export interface SiteFontPair {
    key: string;
    /** What a merchant reads in Website › Style, in plain words. */
    name: string;
    heading: SiteFontFace;
    body: SiteFontFace;
}

const face = (
    family: string | null,
    fallback: string,
    weights: readonly number[] = [],
): SiteFontFace => ({ family, weights, fallback });

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
    {
        key: "archivo-narrow",
        name: "Archivo Narrow and Archivo",
        heading: face("Archivo Narrow", SYSTEM_FONT_STACK),
        body: face("Archivo", SYSTEM_FONT_STACK),
    },
    {
        key: "source-serif-inter",
        name: "Source Serif and Inter",
        heading: face("Source Serif 4", SERIF_FALLBACK),
        body: face("Inter", SYSTEM_FONT_STACK),
    },
    {
        key: "geist-jetbrains",
        name: "Geist and JetBrains Mono",
        heading: face("Geist", SYSTEM_FONT_STACK),
        body: face("JetBrains Mono", MONO_FALLBACK),
    },
    {
        key: "archivo",
        name: "Archivo",
        heading: face("Archivo", SYSTEM_FONT_STACK),
        body: face("Archivo", SYSTEM_FONT_STACK),
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
 * A role's `font-family` value. `loaded` is the family name the renderer's
 * font loader registered (next/font hashes it); without one the plain family
 * name is used, which renders wherever that face is installed or loaded by
 * name, and falls through to the fallback everywhere else.
 */
export function fontStack(face: SiteFontFace, loaded?: string): string {
    if (face.family === null) return face.fallback;
    return `${loaded ?? `"${face.family}"`}, ${face.fallback}`;
}
