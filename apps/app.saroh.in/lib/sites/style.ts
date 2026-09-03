/**
 * Site style — types and the pure resolver (#189).
 *
 * Deliberately its own module with NO server imports. `lib/sites/service.ts`
 * reaches for `next/headers` through `apiFetch`, so anything it exports is
 * server-only; the editor preview is a client component and has to resolve a
 * style as a slider moves. Putting the pure part here is what lets both sides
 * use it.
 */

/** One selectable colour, as the API serves it. */
export interface StyleSwatch {
    key: string;
    label: string;
    /** HSL components, ready for `hsl(...)`. */
    hsl: string;
}

/**
 * The palette and slider bounds, served with the site.
 *
 * The editor never carries its own copy of these values: the sliders re-render
 * the preview as they move, so resolution happens in the browser, and a second
 * copy of the palette could drift from the server's — which would mean styling
 * one thing and publishing another.
 */
export interface SiteStyleOptions {
    rows: { key: string; label: string; swatches: StyleSwatch[] }[];
    scalars: {
        key: string;
        label: string;
        min: number;
        max: number;
        step: number;
        unit: string;
        /** What Reset returns to — the business's own starting look. */
        default: number;
    }[];
}

export interface SiteStyle {
    colours: Record<string, string>;
    scalars: Record<string, number>;
}

/**
 * Text that stays readable on a swatch. Mirrors `readableOn` in the API so the
 * preview and the published site agree; the RULE is duplicated, the palette
 * VALUES are not.
 */
export function readableOn(hsl: string): string {
    const lightness = Number.parseFloat(hsl.trim().split(/\s+/)[2] ?? "50");
    return Number.isFinite(lightness) && lightness < 55
        ? "0 0% 98%"
        : "24 10% 10%";
}

/**
 * Whether two swatches are far enough apart in lightness to read. Mirrors
 * `contrastOk` in the API so the panel, the preview and the published site all
 * agree about which pairings are legible.
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
 * A colour part-way between the ground and the text, in lightness and
 * saturation. Mirrors `mixTowardGround` in the API so the preview and the
 * published site derive body copy, muted labels and hairlines identically; the
 * RULE is duplicated, the palette VALUES are not.
 *
 * These three are derived rather than chosen: a merchant picks six colours, not
 * nine, and a fixed pale hairline is invisible on a dark ground.
 */
export function mixTowardGround(
    ground: string,
    text: string,
    ratio: number,
): string {
    const parts = (hsl: string) => hsl.trim().split(/\s+/);
    const num = (value: string | undefined) =>
        Number.parseFloat(value ?? "") || 0;

    const g = parts(ground);
    const t = parts(text);
    if (g.length < 3 || t.length < 3) return text;

    const mix = (from: number, to: number) => from + ratio * (to - from);
    const textSaturation = num(t[1]);
    const saturation = mix(num(g[1]), textSaturation);
    const lightness = mix(num(g[2]), num(t[2]));
    // An achromatic text swatch has no hue to lend, so whatever saturation
    // survives the mix came from the ground and must wear the ground's hue.
    const hue = textSaturation > 1 ? t[0] : g[0];
    return `${hue} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%`;
}

/**
 * Resolve a style into the `--site-*` custom properties the preview reads.
 *
 * Runs in the browser so a slider re-renders the preview as it moves, using the
 * palette the API served rather than a local copy of it.
 */
export function resolveStyleVariables(
    style: SiteStyle,
    options: SiteStyleOptions,
): Record<string, string> {
    const pick = (row: string): string | undefined => {
        const swatches =
            options.rows.find((r) => r.key === row)?.swatches ?? [];
        // `.at(0)` rather than `[0]`: `noUncheckedIndexedAccess` is off in this
        // repo, so an index TYPES as present on an empty array while being
        // undefined at runtime. A row can arrive empty from an older server,
        // and that lie is how "undefined" ends up rendered into a CSS variable.
        const chosen =
            swatches.find((sw) => sw.key === style.colours[row]) ??
            swatches.at(0);
        return chosen?.hsl;
    };
    const num = (key: string) => style.scalars[key];
    const vars: Record<string, string> = {};
    const set = (name: string, value: string | undefined) => {
        if (value !== undefined) vars[name] = value;
    };

    const accent = pick("accent");
    const cta = pick("ctaBand");
    const hero = pick("heroBackground");
    const footer = pick("footer");

    const ground = pick("pageGround");
    const chosenText = pick("text");
    // Safety net for an unreadable pairing — see `contrastOk` in the API for
    // why this exists even though the panel prevents it at the source.
    const text =
        ground && chosenText && !contrastOk(ground, chosenText)
            ? readableOn(ground)
            : chosenText;

    set("--site-bg", ground);
    set("--site-surface", ground);
    set("--site-fg", text);
    // Body, muted and hairline follow the pairing rather than being three more
    // things to choose. Same ratios as the API's resolver.
    const stepBack = (ratio: number) =>
        ground && text ? mixTowardGround(ground, text, ratio) : undefined;
    set("--site-body", stepBack(0.61));
    set("--site-muted", stepBack(0.49));
    set("--site-border", stepBack(0.11));
    set("--site-accent", accent);
    set("--site-accent-fg", accent && readableOn(accent));
    set("--site-hero-bg", hero);
    set("--site-hero-fg", hero && readableOn(hero));
    set("--site-cta-bg", cta);
    set("--site-cta-fg", cta && readableOn(cta));
    set("--site-footer-bg", footer);
    set("--site-footer-fg", footer && readableOn(footer));
    set("--site-page-margin", `${num("pageMargin")}px`);
    set("--site-section-padding", `${num("sectionPadding")}px`);
    set("--site-grid-gap", `${num("gridGap")}px`);
    set("--site-radius", `${num("cornerRadius")}px`);
    set("--site-heading-scale", `${num("headingScale")}`);
    return vars;
}
