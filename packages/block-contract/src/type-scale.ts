/**
 * A template's type scale (DEC-090): the few sizes a design sets that the
 * heading-scale slider cannot — how large the display line is, how large
 * body copy reads, how long a reading line runs, and whether section titles
 * are set as small wide-tracked capitals (an eyebrow).
 *
 * Bounded, not free: each is a number in a narrow range or a word from a
 * list, refused outside it. Like a palette it reaches a site only as part of
 * one of its template's colourways; Website › Style has no control for it.
 *
 * Each becomes a `--site-*` property ({@link typeScaleVariables}) that the
 * blocks read with today's value as the `var()` fallback, so a site with no
 * type scale draws exactly as it did.
 */

export const TYPE_SCALE_BOUNDS = {
    /** The hero's line, in px. */
    displaySize: { min: 40, max: 72, unit: "px" },
    /** Body copy in text blocks and posts, in px. */
    bodySize: { min: 15, max: 19, unit: "px" },
    /** The longest reading line, in characters. */
    measure: { min: 52, max: 76, unit: "ch" },
} as const;
export type TypeScaleSize = keyof typeof TYPE_SCALE_BOUNDS;
const SIZE_KEYS = Object.keys(TYPE_SCALE_BOUNDS) as TypeScaleSize[];

/**
 * How section titles are set. `plain` is today's heading. `eyebrow` sets
 * them small, uppercase and wide-tracked in the quiet text colour;
 * `eyebrowAccent` the same in the accent (the ceramics design's green
 * labels). The palette's contrast rules already hold both colours to 4.5:1
 * on the page.
 */
export const LABEL_STYLES = ["plain", "eyebrow", "eyebrowAccent"] as const;
export type LabelStyle = (typeof LABEL_STYLES)[number];

export interface SiteTypeScale {
    displaySize?: number;
    bodySize?: number;
    measure?: number;
    labelStyle?: LabelStyle;
}

export interface TypeScaleProblem {
    field: string;
    message: string;
}

export type TypeScaleResult =
    | { ok: true; type: SiteTypeScale }
    | { ok: false; problems: TypeScaleProblem[] };

/**
 * Validate a type scale. Refuses, never clamps: a type scale is written by a
 * template author, and one outside the bounds is a mistake to fix, not a
 * slider that overshot. `labelStyle: "plain"` is stored as absent, as the
 * default font pair is, so "plain" and "never set" are one look and one
 * stored value.
 */
export function parseTypeScale(input: unknown): TypeScaleResult {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return {
            ok: false,
            problems: [{ field: "type", message: "type must be an object" }],
        };
    }
    const raw = input as Record<string, unknown>;
    const problems: TypeScaleProblem[] = [];
    const type: SiteTypeScale = {};
    const known = new Set<string>([...SIZE_KEYS, "labelStyle"]);
    for (const key of Object.keys(raw)) {
        if (!known.has(key)) {
            problems.push({
                field: `type.${key}`,
                message: `"${key}" is not part of a type scale`,
            });
        }
    }
    for (const key of SIZE_KEYS) {
        const value = raw[key];
        if (value === undefined) continue;
        const { min, max, unit } = TYPE_SCALE_BOUNDS[key];
        if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < min ||
            value > max
        ) {
            problems.push({
                field: `type.${key}`,
                message: `${key} must be from ${min}${unit} to ${max}${unit}`,
            });
            continue;
        }
        // Half steps at most: 18.5px body is a real size, 18.37px is not.
        type[key] = Math.round(value * 2) / 2;
    }
    const label = raw.labelStyle;
    if (label !== undefined) {
        if (!(LABEL_STYLES as readonly unknown[]).includes(label)) {
            problems.push({
                field: "type.labelStyle",
                message: `labelStyle must be one of ${LABEL_STYLES.join(", ")}`,
            });
        } else if (label !== "plain") {
            type.labelStyle = label as LabelStyle;
        }
    }
    return problems.length > 0 ? { ok: false, problems } : { ok: true, type };
}

/** Whether two parsed type scales set the same type. */
export function sameTypeScale(
    a: SiteTypeScale | undefined,
    b: SiteTypeScale | undefined,
): boolean {
    const x = a ?? {};
    const y = b ?? {};
    return (
        SIZE_KEYS.every((k) => x[k] === y[k]) && x.labelStyle === y.labelStyle
    );
}

/**
 * The `--site-*` properties a type scale sets; nothing for what it leaves
 * out, so the blocks' fallbacks (today's sizes) apply. `--site-label-style`
 * carries a WORD from {@link LABEL_STYLES}: `SiteTheme` turns it into a rule
 * of its own and never writes the value into CSS.
 */
export function typeScaleVariables(
    type: SiteTypeScale | undefined,
): Record<string, string> {
    if (!type) return {};
    const vars: Record<string, string> = {};
    if (type.displaySize !== undefined) {
        vars["--site-display-size"] = `${type.displaySize}px`;
    }
    if (type.bodySize !== undefined) {
        vars["--site-body-size"] = `${type.bodySize}px`;
    }
    if (type.measure !== undefined) {
        vars["--site-measure"] = `${type.measure}ch`;
    }
    if (type.labelStyle && type.labelStyle !== "plain") {
        vars["--site-label-style"] = type.labelStyle;
    }
    return vars;
}
