import type { FontPairKey } from "./fonts";
import { DEFAULT_FONT_PAIR, fontPairVariables, isFontPairKey } from "./fonts";
import type { SitePalette } from "./palette";
import { paletteVariables, parsePalette } from "./palette";
import type { SiteTypeScale } from "./type-scale";
import { parseTypeScale, typeScaleVariables } from "./type-scale";

/**
 * A site's look and the `--site-*` variables it resolves to (#189, DEC-090),
 * shared by everything that turns a style into a page: the API (which
 * validates a saved style, `parseSiteStyle` in `site-style.ts`, and writes
 * the variables into every publication) and the renderer's template renders
 * (industry templates U14), which draw a template's colourway without a
 * site behind it. One implementation, so a gallery render cannot show a
 * colour a site made from that colourway would not have.
 *
 * Moved here from `apps/api.saroh.in/src/modules/sites/site-style.ts`, which
 * re-exports it unchanged.
 */

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
        /*
         * 1px is a template's floor, not a merchant's slider (DEC-090): the
         * ceramics and studio designs draw hairlines between photos with a
         * 1–3px gap. The slider still starts at `pickerMin`, so a merchant
         * is offered the gaps a card grid reads with; a site whose template
         * set a hairline keeps it.
         */
        min: 1,
        pickerMin: 6,
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
    /**
     * The typeface pair (KTD-2), a key from `FONT_PAIRS`. ABSENT for the
     * default (system) pair rather than written as `"system"`: every snapshot
     * published before fonts existed has no such field, and the pending-change
     * count compares `style` byte for byte, so a default written out would
     * report "the style changed" on every live site nobody touched.
     */
    fontPair?: FontPairKey;
    /**
     * A template's own exact colours (DEC-090), complete and validated by
     * `parsePalette`; when present they replace the six rows' colours.
     * ABSENT unless the site is in a colourway that has one, for the reason
     * `fontPair` is. A merchant reaches it only by choosing one of their
     * template's colourways (`site-style-offer.ts`).
     */
    palette?: SitePalette;
    /** A template's type scale (DEC-090), absent for today's sizes. */
    type?: SiteTypeScale;
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
 * A colour part-way between two swatches, in lightness and saturation.
 *
 * Body copy, muted labels and hairlines are not choices a merchant makes — they
 * are the text colour stepped back toward the page ground. Deriving them means
 * six choices instead of nine, and it means a dark palette gets hairlines that
 * read: a fixed pale border is invisible on a dark ground, which is how a
 * "themeable" site quietly stops having any visible structure.
 *
 * The three ratios below reproduce today's stone greys almost exactly for the
 * default paper/ink pairing, so this is a visual no-op for a site that has
 * chosen nothing.
 *
 * Hue comes from whichever swatch actually carries colour. Taking it from the
 * text unconditionally is wrong when the text is achromatic: "Chalk" is
 * `0 0% 98%`, whose hue 0 is a placeholder rather than a choice, and pairing it
 * with saturation mixed in from a slate ground produced reddish hairlines on a
 * blue site. When the text has a hue of its own it wins — mixing hues would
 * take a navy body toward neutral grey and lose the reason someone picked navy.
 */
function mixTowardGround(ground: string, text: string, ratio: number): string {
    const parts = (hsl: string) => hsl.trim().split(/\s+/);
    const num = (value: string | undefined) =>
        Number.parseFloat(value ?? "") || 0;

    const g = parts(ground);
    const t = parts(text);
    // A swatch that is not three parts is not something to interpolate; hand
    // back the text colour rather than emitting `NaN%` into a stylesheet.
    if (g.length < 3 || t.length < 3) return text;

    const mix = (from: number, to: number) => from + ratio * (to - from);
    const textSaturation = num(t[1]);
    const saturation = mix(num(g[1]), textSaturation);
    const lightness = mix(num(g[2]), num(t[2]));
    // Below 1% there is no hue to speak of, so the remaining saturation can
    // only have come from the ground — and it must wear the ground's hue.
    const hue = textSaturation > 1 ? t[0] : g[0];
    return `${hue} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%`;
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
        // Body, muted and hairline: the text colour stepped back toward the
        // ground. The ratios reproduce the previous stone defaults for the
        // default pairing.
        "--site-body": mixTowardGround(ground, text, 0.61),
        "--site-muted": mixTowardGround(ground, text, 0.49),
        "--site-border": mixTowardGround(ground, text, 0.11),
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
        /*
         * The typeface, as the pair's KEY rather than a font stack (KTD-2).
         * The renderer loads the faces and owns their CSS family names (the
         * loader hashes them), so it translates the key; `SiteTheme` writes
         * only stacks from its own list, never a value from here. A renderer
         * that does not know the key drops it and keeps the system stack.
         * Absent for the default pair, so a site that chose nothing resolves
         * to exactly the variables it always did. A pair with a mono face
         * names it too (`--site-font-mono`), for its machine facts.
         */
        ...fontPairVariables(style.fontPair),
        /*
         * A template's own colours replace the rows' (DEC-090). Already
         * checked to 4.5:1 per pairing, so none of the corrections above
         * applies; turned into HSL triples, the notation every other
         * `--site-*` colour is in, so the renderer's guard is unchanged.
         */
        ...(style.palette ? paletteVariables(style.palette) : {}),
        // Its type scale: nothing at all for a site without one.
        ...typeScaleVariables(style.type),
    };
}

/**
 * A template colourway's look as a {@link SiteStyle}, without a saved site
 * (industry templates U14: the renderer's gallery renders). The happy path
 * of the API's `parseSiteStyle`: what it would keep, it keeps; what it would
 * refuse, this leaves at the default instead of throwing, because a render
 * should still draw. Every shipped colourway parses cleanly — the API's
 * template specs hold that, and that the two agree on every one of them.
 */
export function presetSiteStyle(input: {
    colours?: Readonly<Record<string, string>>;
    scalars?: Readonly<Record<string, number>>;
    fontPair?: string;
    palette?: unknown;
    type?: unknown;
}): SiteStyle {
    const style = defaultSiteStyle();
    for (const row of STYLE_ROW_KEYS) {
        const key = input.colours?.[row];
        if (key && STYLE_ROWS[row].some((s) => s.key === key)) {
            style.colours[row] = key;
        }
    }
    for (const key of STYLE_SCALAR_KEYS) {
        const value = input.scalars?.[key];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const { min, max } = STYLE_SCALARS[key];
        style.scalars[key] = Math.min(max, Math.max(min, value));
    }
    if (isFontPairKey(input.fontPair) && input.fontPair !== DEFAULT_FONT_PAIR) {
        style.fontPair = input.fontPair;
    }
    if (input.palette !== undefined && input.palette !== null) {
        const parsed = parsePalette(input.palette);
        if (parsed.ok) style.palette = parsed.palette;
    }
    if (input.type !== undefined && input.type !== null) {
        const parsed = parseTypeScale(input.type);
        if (parsed.ok && Object.keys(parsed.type).length > 0) {
            style.type = parsed.type;
        }
    }
    return style;
}
