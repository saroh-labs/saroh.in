import { BadRequestException } from "@nestjs/common";

/**
 * A site's look: six colour choices and five spacing scalars (#189).
 *
 * Two rules shape this module.
 *
 * **Curated, not free.** Colours are CHOICES from a fixed set, stored as keys
 * rather than raw hex. The design calls for five options per row "drawn from the
 * business's own palette so nothing goes off-system", and a model that accepts
 * any hex cannot make that promise — it just moves the problem to whoever writes
 * the picker. Keys also survive a palette being retuned later.
 *
 * **Merchant tokens only.** These resolve into the `--site-*` layer that
 * `saroh.app` already defines. `PRODUCT.md` is explicit that the merchant's site
 * must never inherit Saroh's brand, and that this layer is separate by design.
 * Nothing here may touch Saroh's own tokens.
 *
 * Pure: no Nest DI, no Prisma, so the rules are unit-testable and reusable by
 * the editor, the publish path and the renderer.
 */

/** One selectable colour: a stable key and the HSL triple it resolves to. */
export interface Swatch {
    key: string;
    label: string;
    /** HSL components, as the `--site-*` layer already expects them. */
    hsl: string;
}

/**
 * The six rows the design draws, in its order. Five options each.
 *
 * The first entry of every row is the current default, so a site with no style
 * saved renders exactly as it does today — this is a visual no-op until someone
 * chooses something.
 */
export const STYLE_ROWS = {
    pageGround: [
        { key: "paper", label: "Paper", hsl: "0 0% 100%" },
        { key: "bone", label: "Bone", hsl: "40 24% 97%" },
        { key: "mist", label: "Mist", hsl: "210 20% 97%" },
        { key: "sand", label: "Sand", hsl: "35 30% 95%" },
        { key: "slate", label: "Slate", hsl: "215 25% 12%" },
    ],
    text: [
        { key: "ink", label: "Ink", hsl: "24 10% 10%" },
        { key: "navy", label: "Navy", hsl: "215 40% 20%" },
        { key: "plum", label: "Plum", hsl: "280 25% 22%" },
        { key: "graphite", label: "Graphite", hsl: "220 9% 30%" },
        { key: "chalk", label: "Chalk", hsl: "0 0% 98%" },
    ],
    accent: [
        { key: "clay", label: "Clay", hsl: "18 45% 45%" },
        { key: "teal", label: "Teal", hsl: "190 60% 35%" },
        { key: "moss", label: "Moss", hsl: "150 30% 35%" },
        { key: "rose", label: "Rose", hsl: "340 65% 55%" },
        { key: "steel", label: "Steel", hsl: "215 20% 45%" },
    ],
    heroBackground: [
        { key: "paper", label: "Paper", hsl: "0 0% 100%" },
        { key: "bone", label: "Bone", hsl: "40 24% 97%" },
        { key: "wheat", label: "Wheat", hsl: "38 55% 88%" },
        { key: "deep", label: "Deep", hsl: "215 35% 22%" },
        { key: "shadow", label: "Shadow", hsl: "220 12% 20%" },
    ],
    ctaBand: [
        { key: "clay", label: "Clay", hsl: "18 45% 45%" },
        { key: "navy", label: "Navy", hsl: "215 40% 25%" },
        { key: "graphite", label: "Graphite", hsl: "220 9% 30%" },
        { key: "plum", label: "Plum", hsl: "280 25% 30%" },
        { key: "clayLight", label: "Warm", hsl: "18 40% 62%" },
    ],
    footer: [
        { key: "clay", label: "Clay", hsl: "18 30% 30%" },
        { key: "navy", label: "Navy", hsl: "215 40% 20%" },
        { key: "plum", label: "Plum", hsl: "280 20% 22%" },
        { key: "chalk", label: "Chalk", hsl: "0 0% 96%" },
        { key: "ink", label: "Ink", hsl: "24 10% 10%" },
    ],
} as const satisfies Record<string, readonly Swatch[]>;

export type StyleRow = keyof typeof STYLE_ROWS;
export const STYLE_ROW_KEYS = Object.keys(STYLE_ROWS) as StyleRow[];

/** Human labels for the rows, in the design's wording. */
export const STYLE_ROW_LABELS: Record<StyleRow, string> = {
    pageGround: "Page ground",
    text: "Text",
    accent: "Accent",
    heroBackground: "Hero background",
    ctaBand: "Call-to-action band",
    footer: "Footer",
};

/**
 * The five sliders, with the design's ranges.
 *
 * `step` matters as much as the bounds: a heading scale that can land on 1.037×
 * is a slider nobody can return to a sensible value.
 */
export const STYLE_SCALARS = {
    pageMargin: {
        label: "Page margin",
        min: 16,
        max: 80,
        step: 1,
        unit: "px",
        default: 38,
    },
    sectionPadding: {
        label: "Section padding",
        min: 24,
        max: 96,
        step: 1,
        unit: "px",
        default: 52,
    },
    gridGap: {
        label: "Grid gap",
        min: 6,
        max: 32,
        step: 1,
        unit: "px",
        default: 14,
    },
    cornerRadius: {
        label: "Corner radius",
        min: 0,
        max: 24,
        step: 1,
        unit: "px",
        default: 2,
    },
    headingScale: {
        label: "Heading scale",
        min: 0.8,
        max: 1.4,
        step: 0.05,
        unit: "×",
        default: 1,
    },
} as const;

export type StyleScalar = keyof typeof STYLE_SCALARS;
export const STYLE_SCALAR_KEYS = Object.keys(STYLE_SCALARS) as StyleScalar[];

export interface SiteStyle {
    colours: Record<StyleRow, string>;
    scalars: Record<StyleScalar, number>;
}

/** The look a site has before anyone chooses anything: today's appearance. */
export function defaultSiteStyle(): SiteStyle {
    return {
        colours: Object.fromEntries(
            STYLE_ROW_KEYS.map((row) => [row, STYLE_ROWS[row][0].key]),
        ) as Record<StyleRow, string>,
        scalars: Object.fromEntries(
            STYLE_SCALAR_KEYS.map((s) => [s, STYLE_SCALARS[s].default]),
        ) as Record<StyleScalar, number>,
    };
}

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
    const raw = input as { colours?: unknown; scalars?: unknown };

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

    return base;
}

/**
 * Text that stays readable on a given swatch.
 *
 * Derived from the swatch's own lightness rather than stored per option: an
 * "accent foreground" field would be a second thing to keep in sync, and the
 * one rule below is what a designer would apply anyway. #189 requires contrast
 * to hold at both ends of every row, and a palette entry cannot silently ship
 * white-on-cream by forgetting a field that does not exist.
 *
 * The 55% threshold is where a mid-tone stops carrying white text comfortably;
 * the returned values are near-white and near-black rather than pure, which is
 * gentler on a large filled area.
 */
export function readableOn(hsl: string): string {
    const lightness = Number.parseFloat(hsl.trim().split(/\s+/)[2] ?? "50");
    return Number.isFinite(lightness) && lightness < 55
        ? "0 0% 98%"
        : "24 10% 10%";
}

/**
 * Whether two swatches are far enough apart in lightness to read.
 *
 * A crude proxy for contrast, and deliberately so: the palette is curated, so
 * this only has to catch the combinations a merchant can actually produce —
 * dark text on a dark ground, light on light. A full WCAG ratio would be more
 * precise about pairs that cannot occur here.
 */
export function contrastOk(bgHsl: string, fgHsl: string): boolean {
    const l = (hsl: string) =>
        Number.parseFloat(hsl.trim().split(/\s+/)[2] ?? "50");
    const a = l(bgHsl);
    const b = l(fgHsl);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    return Math.abs(a - b) > 40;
}

/**
 * Resolve a style into the `--site-*` custom properties the renderer reads.
 *
 * One implementation, used by the editor preview and by publishing, so a
 * merchant cannot style one thing and publish another.
 */
export function siteStyleVariables(style: SiteStyle): Record<string, string> {
    const swatch = (row: StyleRow) =>
        (
            STYLE_ROWS[row].find((s) => s.key === style.colours[row]) ??
            STYLE_ROWS[row][0]
        ).hsl;

    const ground = swatch("pageGround");
    const chosenText = swatch("text");
    /*
     * Page ground and text are independent choices, so a merchant can pick a
     * dark ground and dark text and end up with body copy nobody can read —
     * which #189 names as the risk the curation exists to prevent. The panel
     * moves the text selection when a ground makes it illegible, and this is
     * the safety net for everything that does not go through the panel: a style
     * saved by an older client, or a ground changed by one tab while another
     * held the old text.
     */
    const text = contrastOk(ground, chosenText)
        ? chosenText
        : readableOn(ground);

    return {
        "--site-bg": ground,
        "--site-surface": ground,
        "--site-fg": text,
        "--site-accent": swatch("accent"),
        "--site-accent-fg": readableOn(swatch("accent")),
        "--site-hero-bg": swatch("heroBackground"),
        "--site-cta-bg": swatch("ctaBand"),
        "--site-cta-fg": readableOn(swatch("ctaBand")),
        "--site-footer-bg": swatch("footer"),
        "--site-footer-fg": readableOn(swatch("footer")),
        "--site-hero-fg": readableOn(swatch("heroBackground")),
        "--site-page-margin": `${style.scalars.pageMargin}px`,
        "--site-section-padding": `${style.scalars.sectionPadding}px`,
        "--site-grid-gap": `${style.scalars.gridGap}px`,
        "--site-radius": `${style.scalars.cornerRadius}px`,
        "--site-heading-scale": `${style.scalars.headingScale}`,
    };
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
}

export function siteStyleOptions(): SiteStyleOptions {
    return {
        rows: STYLE_ROW_KEYS.map((row) => ({
            key: row,
            label: STYLE_ROW_LABELS[row],
            swatches: STYLE_ROWS[row].map((s) => ({ ...s })),
        })),
        scalars: STYLE_SCALAR_KEYS.map((key) => ({
            key,
            ...STYLE_SCALARS[key],
        })),
    };
}
