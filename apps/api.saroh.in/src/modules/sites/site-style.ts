import { BadRequestException } from "@nestjs/common";
import type { SiteStyle, StyleRow, StyleScalar } from "@saroh/templates";
import {
    DEFAULT_FONT_PAIR,
    defaultSiteStyle,
    FONT_PAIRS,
    isFontPairKey,
    parsePalette,
    parseTypeScale,
    STYLE_ROW_KEYS,
    STYLE_ROW_LABELS,
    STYLE_ROWS,
    STYLE_SCALAR_KEYS,
    STYLE_SCALARS,
} from "@saroh/templates";

/**
 * A site's look (#189): the rows, sliders and the variables they resolve to
 * live in `@saroh/block-contract` (`site-style.ts`), shared with the
 * renderer's template renders, and are re-exported here unchanged. What
 * stays here is the API's half: validating a style a client saved, with
 * the 400s that name the field, and the options the editor's panel draws.
 */
export {
    contrastOk,
    defaultSiteStyle,
    readableOn,
    siteStyleVariables,
    STYLE_ROW_KEYS,
    STYLE_ROW_LABELS,
    STYLE_ROWS,
    STYLE_SCALAR_KEYS,
    STYLE_SCALARS,
} from "@saroh/templates";
export type {
    SiteStyle,
    StyleRow,
    StyleScalar,
    Swatch,
} from "@saroh/templates";

/**
 * Validate and normalize a style, filling anything absent from the default.
 *
 * Rejects an unknown colour key rather than coercing it: a key that is not in
 * the row is either a stale palette or a caller inventing colours, and silently
 * substituting one would make the site look different from what was asked for
 * with nothing to explain it.
 *
 * Numbers are CLAMPED rather than rejected. A slider that arrives slightly out
 * of range is a rounding artefact, not an attack, and clamping keeps the site
 * renderable; a value that is not a number at all is still an error.
 */
export function parseSiteStyle(input: unknown): SiteStyle {
    const base = defaultSiteStyle();
    if (input === null || input === undefined) return base;
    if (typeof input !== "object" || Array.isArray(input)) {
        throw new BadRequestException("style must be an object");
    }
    const raw = input as {
        colours?: unknown;
        scalars?: unknown;
        fontPair?: unknown;
        palette?: unknown;
        type?: unknown;
    };

    if (raw.colours !== undefined) {
        if (typeof raw.colours !== "object" || raw.colours === null) {
            throw new BadRequestException("style.colours must be an object");
        }
        const colours = raw.colours as Record<string, unknown>;
        for (const row of STYLE_ROW_KEYS) {
            const value = colours[row];
            if (value === undefined) continue;
            if (typeof value !== "string") {
                throw new BadRequestException(
                    `style.colours.${row} must be a string`,
                );
            }
            const known = STYLE_ROWS[row].some((s) => s.key === value);
            if (!known) {
                throw new BadRequestException(
                    `"${value}" is not one of the ${STYLE_ROW_LABELS[row]} options`,
                );
            }
            base.colours[row] = value;
        }
    }

    if (raw.scalars !== undefined) {
        if (typeof raw.scalars !== "object" || raw.scalars === null) {
            throw new BadRequestException("style.scalars must be an object");
        }
        const scalars = raw.scalars as Record<string, unknown>;
        for (const key of STYLE_SCALAR_KEYS) {
            const value = scalars[key];
            if (value === undefined) continue;
            if (typeof value !== "number" || !Number.isFinite(value)) {
                throw new BadRequestException(
                    `style.scalars.${key} must be a number`,
                );
            }
            const { min, max } = STYLE_SCALARS[key];
            base.scalars[key] = Math.min(max, Math.max(min, value));
        }
    }

    // Refused, not coerced, like a colour: only a listed pair reaches the
    // renderer, so no font name a client sent is ever written into CSS. Null
    // is "back to the default", the same as absent.
    if (raw.fontPair !== undefined && raw.fontPair !== null) {
        if (!isFontPairKey(raw.fontPair)) {
            throw new BadRequestException({
                message: "Choose one of the typefaces offered",
                details: { field: "fontPair" },
            });
        }
        if (raw.fontPair !== DEFAULT_FONT_PAIR) base.fontPair = raw.fontPair;
    }

    // A template's palette and type scale (DEC-090): refused with every
    // failing field named, never coerced. Null clears either, as absent.
    // WHETHER this site may carry them is the offer's rule, checked where a
    // merchant saves (`assertTemplateLookOffered`); this is only whether
    // they are well formed and legible.
    if (raw.palette !== undefined && raw.palette !== null) {
        const parsed = parsePalette(raw.palette);
        if (!parsed.ok) throw styleProblems(parsed.problems);
        base.palette = parsed.palette;
    }
    if (raw.type !== undefined && raw.type !== null) {
        const parsed = parseTypeScale(raw.type);
        if (!parsed.ok) throw styleProblems(parsed.problems);
        if (Object.keys(parsed.type).length > 0) base.type = parsed.type;
    }

    return base;
}

/**
 * A 400 naming each refused field: `details.field` is the first (the shape
 * the font pair's refusal has), `details.problems` all of them.
 */
function styleProblems(
    problems: { field: string; message: string }[],
): BadRequestException {
    return new BadRequestException({
        message: problems[0]?.message ?? "This style is not valid",
        details: { field: problems[0]?.field, problems },
    });
}

/** One of a template's colourways, as Website › Style offers it. */
export interface StyleColourway {
    /** The preset's id, stable within the template (`Site.templateStyleId`). */
    id: string;
    name: string;
    /** The colourway's whole look, parsed as a saved style is. */
    style: SiteStyle;
    /**
     * Three HSL triples to draw the choice with — page, text, accent — as
     * they resolve, so the chip shows what the page will.
     */
    chips: string[];
}

/**
 * The palette and slider bounds, as the editor needs them to draw the panel.
 *
 * Served rather than duplicated in the frontend on purpose. The editor has to
 * resolve a colour choice into a value LOCALLY — the design's sliders re-render
 * the preview as they move, which a round trip cannot do — so it needs the hex
 * values in the browser. If it carried its own copy they could drift from
 * these, and the merchant would style one thing and publish another. The values
 * live here; the editor is given them.
 */
export interface SiteStyleOptions {
    rows: {
        key: StyleRow;
        label: string;
        swatches: { key: string; label: string; hsl: string }[];
    }[];
    scalars: {
        key: StyleScalar;
        label: string;
        min: number;
        max: number;
        step: number;
        unit: string;
        /**
         * What Reset returns to. Served rather than known by the editor: the
         * defaults are the business's own starting look, and a client copy
         * would drift the moment one is retuned here.
         */
        default: number;
    }[];
    /** The typeface pairs Website › Style offers, the default first. */
    fontPairs: { key: string; name: string }[];
    /**
     * The site's template's colourways (DEC-090), as named choices, the
     * template's first first. Empty for a site with no recorded template or
     * one whose template has none.
     */
    colourways: StyleColourway[];
    /**
     * The colourway the site was made in, which Reset returns to: the
     * template's look is the business's starting look. Null without one.
     */
    startColourway: string | null;
}

/**
 * @param colourways The site's template's colourways
 *   (`templateColourways` in `site-style-offer.ts`); none by default.
 * @param startColourway The one it was made in (`Site.templateStyleId`).
 */
export function siteStyleOptions(
    colourways: StyleColourway[] = [],
    startColourway?: string | null,
): SiteStyleOptions {
    return {
        rows: STYLE_ROW_KEYS.map((row) => ({
            key: row,
            label: STYLE_ROW_LABELS[row],
            swatches: STYLE_ROWS[row].map((s) => ({ ...s })),
        })),
        scalars: STYLE_SCALAR_KEYS.map((key) => {
            const {
                pickerMin,
                ...bounds
            }: (typeof STYLE_SCALARS)[StyleScalar] & {
                pickerMin?: number;
            } = STYLE_SCALARS[key];
            // The slider's floor is the merchant's, not the template's.
            return { key, ...bounds, min: pickerMin ?? bounds.min };
        }),
        fontPairs: FONT_PAIRS.map((p) => ({ key: p.key, name: p.name })),
        colourways,
        startColourway: startOf(colourways, startColourway),
    };
}

/** The colourway asked for if offered, else the template's first, else none. */
function startOf(
    colourways: StyleColourway[],
    id: string | null | undefined,
): string | null {
    if (colourways.some((c) => c.id === id)) return id ?? null;
    return colourways.length > 0 ? colourways[0].id : null;
}
