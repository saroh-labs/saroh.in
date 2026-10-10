/**
 * The plain icon of a site that has none (DEC-120): a tile in the site's
 * accent colour with its initial, as an SVG. It is what a merchant's tab
 * shows when they uploaded no icon and the business has no logo, so it is
 * drawn from the site's own `--site-*` colours and never carries Saroh's
 * mark.
 *
 * A string, not a component: the renderer serves it as a file
 * (`/site-icon.svg`, `/favicon.ico`) and the workspace shows the same bytes
 * in Website › Settings, so the preview is the icon. No React, no font
 * file and no image library: the letter is set in the reader's system
 * face, so any script draws.
 */

/** SiteTheme's neutral accent and its text, for a site with no look saved. */
const NEUTRAL_TILE = "24 10% 10%";
const NEUTRAL_LETTER = "0 0% 100%";

/** An HSL triple as the publisher writes it: `24 10% 10%`. */
const HSL_TRIPLE =
    /^\d{1,3}(?:\.\d{1,4})? \d{1,3}(?:\.\d{1,4})?% \d{1,3}(?:\.\d{1,4})?%$/;

/** A variable as `hsl(...)`, only when it is a plain triple; else the fallback. */
function colour(value: unknown, fallback: string): string {
    const triple =
        typeof value === "string" && HSL_TRIPLE.test(value.trim())
            ? value.trim()
            : fallback;
    return `hsl(${triple})`;
}

/**
 * A letter or a digit of any script. Built from a string: the apps that
 * compile this file don't all target a version with the `u` flag in a
 * regex literal, and every runtime it runs on has it.
 */
const LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");

/**
 * The site's initial: the first letter or digit of its name, in capitals
 * where the script has them. "" for a name with neither, and the tile is
 * then drawn plain.
 */
export function siteInitial(name: string | null | undefined): string {
    // By code point, composed first, so "É" typed as E and an accent is
    // one letter and a letter outside the basic plane is kept whole.
    const first = Array.from((name ?? "").normalize("NFC")).find((char) =>
        LETTER_OR_DIGIT.test(char),
    );
    return first ? first.toLocaleUpperCase() : "";
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * The tile as an SVG document. `variables` is the site's resolved look
 * (`styleVariables` in a snapshot, or the editor's own resolution of a
 * draft); only two of them are read, each only as an HSL triple, so nothing
 * a snapshot holds is ever written into the file as markup.
 */
export function plainSiteIconSvg({
    name,
    variables,
}: {
    name: string | null | undefined;
    variables?: Readonly<Record<string, string>> | null;
}): string {
    const tile = colour(variables?.["--site-accent"], NEUTRAL_TILE);
    const letter = colour(variables?.["--site-accent-fg"], NEUTRAL_LETTER);
    const initial = siteInitial(name);
    const text = initial
        ? `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', sans-serif" font-size="36" font-weight="600" fill="${letter}">${escapeXml(initial)}</text>`
        : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="${tile}"/>${text}</svg>`;
}

/** The same tile as a `data:` address, for an `<img>` that previews it. */
export function plainSiteIconDataUrl(
    input: Parameters<typeof plainSiteIconSvg>[0],
): string {
    return `data:image/svg+xml,${encodeURIComponent(plainSiteIconSvg(input))}`;
}
