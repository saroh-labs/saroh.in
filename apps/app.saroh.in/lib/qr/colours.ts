import { tooLightToScan } from "@saroh/ui/lib/qr-art";

/**
 * The colours a QR code is offered in. These are the code's ink, data that
 * is stored on the code and drawn into the downloaded file, not styling of
 * the workspace: so they are hex values here and never a Saroh token (a
 * token changes with the theme; a printed code must not).
 *
 * Ink first, then colours from the site's own look where they can be read,
 * else the design's set. Every colour offered passes `tooLightToScan`: one
 * that doesn't is darkened along its own hue until it does, so the saffron
 * the design shows as its too-light example is offered as a deeper amber.
 */

/** Ink, as the API stores the default. */
export const QR_INK = "#1c1c1a";

/** The "Saroh QR Codes" design's swatches after ink. */
export const QR_DESIGN_COLOURS = ["#5c2a48", "#1f4d3a", "#1e3a5f", "#f0a92b"];

/** How many swatches the row holds, ink included. */
export const QR_SWATCH_COUNT = 5;

const HEX = /^#[0-9a-f]{6}$/;

/** "#RRGGBB" in lower case, or null. */
export function normaliseHex(value: string): string | null {
    const hex = value.trim().toLowerCase();
    return HEX.test(hex) ? hex : null;
}

function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => {
        const v = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return Math.round(v * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** An HSL triple as the site's style serves it ("24 80% 50%"), as hex. */
export function hslTripleToHex(triple: string): string | null {
    const m = /^\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*$/.exec(
        triple,
    );
    if (!m) return null;
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    if (![h, s, l].every(Number.isFinite) || s > 1 || l > 1) return null;
    return hslToHex(((h % 360) + 360) % 360, s, l);
}

/**
 * The colour, dark enough to scan: itself when it already is, else the same
 * hue stepped darker until it passes. Null for something that isn't a hex.
 */
export function scannable(value: string): string | null {
    const hex = normaliseHex(value);
    if (!hex) return null;
    if (!tooLightToScan(hex)) return hex;
    const [h, s, start] = hexToHsl(hex);
    for (let l = start - 0.02; l >= 0; l -= 0.02) {
        const darker = hslToHex(h, s, l);
        if (!tooLightToScan(darker)) return darker;
    }
    return QR_INK;
}

/** The parts of a site's look a colour can be read from. */
export interface SiteLook {
    style?: {
        /** A template's exact colours, `#RRGGBB` per role. */
        palette?: Partial<Record<string, string>> | null;
        /** Row → the chosen swatch's key. */
        colours?: Record<string, string> | null;
    } | null;
    styleOptions?: {
        rows?: {
            key: string;
            swatches: { key: string; hsl: string }[];
        }[];
    } | null;
}

/** The palette roles worth offering, most the site's own first. */
const PALETTE_ROLES = ["accent", "ctaBg", "heroBg", "footerBg", "fg"];

/**
 * The site's own colours, as hex, in the order worth offering. A template's
 * palette when the site has one, else the swatch chosen in each style row.
 * Empty when neither can be read.
 */
export function siteColours(look: SiteLook | null | undefined): string[] {
    const out: string[] = [];
    const palette = look?.style?.palette;
    if (palette) {
        for (const role of PALETTE_ROLES) {
            const hex = normaliseHex(palette[role] ?? "");
            if (hex) out.push(hex);
        }
        return out;
    }
    const chosen = look?.style?.colours ?? {};
    for (const row of look?.styleOptions?.rows ?? []) {
        const swatch = row.swatches.find((s) => s.key === chosen[row.key]);
        const hex = swatch ? hslTripleToHex(swatch.hsl) : null;
        if (hex) out.push(hex);
    }
    return out;
}

/**
 * The swatches offered: ink, then the site's colours, then the design's to
 * fill the row. Each is made scannable, and one that reads the same as a
 * colour already there (ink, or a near-black) is left out.
 */
export function qrSwatches(look?: SiteLook | null): string[] {
    const out = [QR_INK];
    const add = (value: string) => {
        if (out.length >= QR_SWATCH_COUNT) return;
        const hex = scannable(value);
        if (!hex || out.includes(hex)) return;
        // Almost black next to ink is no choice at all.
        const [, , l] = hexToHsl(hex);
        if (l < 0.14) return;
        out.push(hex);
    };
    for (const hex of siteColours(look)) add(hex);
    for (const hex of QR_DESIGN_COLOURS) add(hex);
    return out;
}

/**
 * The swatches with a saved code's own colour among them, so a code made
 * in a colour the site no longer has still shows which one it is.
 */
export function swatchesWith(
    swatches: readonly string[],
    color: string,
): string[] {
    const hex = normaliseHex(color);
    if (!hex || swatches.includes(hex)) return [...swatches];
    return [...swatches, hex];
}
