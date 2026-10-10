import { encode } from "uqr";

/**
 * QR art: a link drawn as a code a business can put on its counter, plain
 * or in its own look (round dots, round eyes, a box in the middle for a
 * logo). Pure functions, no DOM: the workspace, the marketing site's free
 * maker and the API's print files all draw from the same geometry.
 *
 * The proportions are the "Saroh QR Codes" design's, unchanged:
 * - error correction H, so the code survives the logo box and a worn print;
 * - a quiet zone of 4 modules (`viewBox` starts at -4);
 * - the three finder corners are left out of the dots and drawn as "eyes":
 *   nested 7, 5 and 3 module squares, filled with `evenodd`;
 * - the logo box is `L = round(n * 0.22)` modules, made odd so it centres on
 *   the grid, with one module of white around it.
 *
 * This is not the UPI QR on a pay page (`@saroh/site-blocks`
 * `pay-instructions/model.ts`), which stays as it is.
 */

export type QrArtStyle = "plain" | "branded";

export interface QrArtOptions {
    /** `plain`: squares and square eyes. `branded`: dots and round eyes. */
    style?: QrArtStyle;
    /** Leave the centre box empty for a logo. */
    logo?: boolean;
}

export interface QrArt {
    /** Modules along one side, without the quiet zone. 0 when empty. */
    n: number;
    /** `-4 -4 n+8 n+8`: the code with its quiet zone. */
    viewBox: string;
    /** The data modules, one mark each, as a path `d`. */
    dots: string;
    /** The three finder eyes as a path `d`; fill with `fill-rule="evenodd"`. */
    eyes: string;
    /**
     * The white box knocked out of the centre, in modules: the logo tile
     * plus one module around it. The tile is `size - 2`, inset by 1.
     */
    logoBox: { x: number; y: number; size: number } | null;
    /** The box's width as a percentage of the drawn code (with quiet zone). */
    boxPct: number;
    /** The logo tile's width as a percentage of the box. */
    tilePct: number;
}

/** Modules of white around the code. */
export const QR_QUIET_ZONE = 4;
/** The side of a downloaded SVG or PNG, in pixels. */
export const QR_EXPORT_SIZE = 1200;
/** The ground a code is drawn on. A QR needs a light ground to scan. */
export const QR_GROUND = "#FFFFFF";
/** The initials tile, as the design draws it: Ink with Paper letters. */
export const QR_TILE_FILL = "#1C1C1A";
export const QR_TILE_TEXT = "#F5F2EC";

/** A finder pattern with its separator: 8 modules at three corners. */
const FINDER = 8;

/** Trims float noise so the same input always writes the same path. */
const f = (v: number): string => String(Math.round(v * 1000) / 1000);

function viewBoxOf(n: number): string {
    const side = n + QR_QUIET_ZONE * 2;
    return `${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${side} ${side}`;
}

/** What an empty or unencodable text draws: nothing, and never a throw. */
export function emptyQrArt(): QrArt {
    return {
        n: 0,
        viewBox: viewBoxOf(0),
        dots: "",
        eyes: "",
        logoBox: null,
        boxPct: 0,
        tilePct: 0,
    };
}

/** A rectangle as a closed path, with corners of radius `r` (0: square). */
function rr(x: number, y: number, w: number, h: number, r: number): string {
    if (r <= 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
    const a = `a${f(r)} ${f(r)} 0 0 1`;
    return (
        `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}${a} ${f(r)} ${f(r)}` +
        `v${f(h - 2 * r)}${a} ${f(-r)} ${f(r)}` +
        `h${f(-(w - 2 * r))}${a} ${f(-r)} ${f(-r)}` +
        `v${f(-(h - 2 * r))}${a} ${f(r)} ${f(-r)}z`
    );
}

function eye(x: number, y: number, rounded: boolean): string {
    return (
        rr(x, y, 7, 7, rounded ? 2 : 0) +
        rr(x + 1, y + 1, 5, 5, rounded ? 1.3 : 0) +
        rr(x + 2, y + 2, 3, 3, rounded ? 0.9 : 0)
    );
}

/** True for the three finder corners, which the eyes draw instead. */
export function isQrFinderCell(n: number, row: number, col: number): boolean {
    const near = (v: number) => v < FINDER;
    const far = (v: number) => v >= n - FINDER;
    return (
        (near(row) && near(col)) ||
        (near(row) && far(col)) ||
        (far(row) && near(col))
    );
}

/** The logo box for a code of `n` modules: the tile `L`, plus 1 around. */
function logoBoxOf(n: number): { x: number; y: number; size: number } {
    let tile = Math.round(n * 0.22);
    if (tile % 2 === 0) tile += 1;
    const start = (n - tile) / 2;
    return { x: start - 1, y: start - 1, size: tile + 2 };
}

/**
 * Draws `text` as QR art. Empty text, or text too long for any QR, gives
 * `emptyQrArt()`.
 */
export function qrArt(text: string, options: QrArtOptions = {}): QrArt {
    const { style = "plain", logo = false } = options;
    if (typeof text !== "string" || text.trim() === "") return emptyQrArt();

    let data: boolean[][];
    try {
        data = encode(text, { ecc: "H", border: 0 }).data;
    } catch {
        // uqr throws when the text does not fit version 40.
        return emptyQrArt();
    }
    const n = data.length;
    if (n === 0) return emptyQrArt();

    const rounded = style === "branded";
    const box = logo ? logoBoxOf(n) : null;
    const inBox = (row: number, col: number) =>
        box !== null &&
        row >= box.y &&
        row < box.y + box.size &&
        col >= box.x &&
        col < box.x + box.size;

    const dots: string[] = [];
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            if (!data[row]?.[col]) continue;
            if (isQrFinderCell(n, row, col) || inBox(row, col)) continue;
            dots.push(
                rounded
                    ? `M${f(col + 0.08)} ${f(row + 0.5)}a.42 .42 0 1 0 .84 0a.42 .42 0 1 0 -.84 0z`
                    : `M${col} ${row}h1v1h-1z`,
            );
        }
    }

    return {
        n,
        viewBox: viewBoxOf(n),
        dots: dots.join(""),
        eyes:
            eye(0, 0, rounded) +
            eye(n - 7, 0, rounded) +
            eye(0, n - 7, rounded),
        logoBox: box,
        boxPct: box ? (box.size / (n + QR_QUIET_ZONE * 2)) * 100 : 0,
        tilePct: box ? ((box.size - 2) / box.size) * 100 : 0,
    };
}

export interface QrLogoGeometry {
    /** The white box, in modules. */
    box: { x: number; y: number; size: number; rx: number };
    /** The logo tile inside it, in modules. */
    tile: { x: number; y: number; size: number; rx: number; imageRx: number };
    /** The initials' type size and where their middle sits, in modules. */
    text: { x: number; y: number; size: number };
}

/**
 * Where the logo goes, in the art's own units, so the screen and the
 * downloaded file draw the same thing. Null when the art has no box.
 */
export function qrLogoGeometry(art: QrArt): QrLogoGeometry | null {
    const box = art.logoBox;
    if (!box) return null;
    const tile = box.size - 2;
    const mid = box.x + box.size / 2;
    return {
        box: { ...box, rx: box.size * 0.18 },
        tile: {
            x: box.x + 1,
            y: box.y + 1,
            size: tile,
            rx: tile * 0.22,
            imageRx: tile * 0.14,
        },
        text: { x: mid, y: mid, size: tile * 0.4 },
    };
}

/** A logo for the centre box: an image, or initials on a tile. */
export type QrSvgLogo = { dataUrl: string } | { initials: string };

export interface QrSvgOptions {
    /** The code's colour. Check it with `tooLightToScan` first. */
    color: string;
    logo?: QrSvgLogo;
    /** A short line under the code ("Scan to book"), on a pill. */
    label?: string;
}

const xml = (s: string): string =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/** At most two letters fit the tile. */
export function qrInitials(initials: string): string {
    return Array.from(initials.trim()).slice(0, 2).join("");
}

/** The face the design sets the initials and the label in. */
const SVG_DISPLAY_FACE = "'Space Grotesk', system-ui, sans-serif";

/**
 * The code as one self-contained 1200×1200 SVG file: white ground, the
 * dots and eyes in `color`, the logo in its box, and the label under the
 * code when there is one. Nothing in it points outside the file, so an
 * image logo must be a `data:image/…` URL; anything else is left out and
 * the box stays white.
 */
export function qrSvg(art: QrArt, options: QrSvgOptions): string {
    const { logo } = options;
    const color = xml(options.color);
    const label = options.label?.replace(/\s+/g, " ").trim() ?? "";
    const size = QR_EXPORT_SIZE;
    const side = art.n + QR_QUIET_ZONE * 2;

    // With a label the code gives up a strip at the foot for the pill; the
    // sizes are the design's 280px preview (20px type, 8/18 padding, 14
    // gap) scaled to the code.
    const codeSize = label ? 960 : size;
    const codeX = (size - codeSize) / 2;
    const codeY = label ? 28 : 0;
    const scale = codeSize / side;

    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">`,
        `<rect width="${size}" height="${size}" fill="${QR_GROUND}"/>`,
        `<g transform="translate(${f(codeX)} ${f(codeY)}) scale(${f(scale)}) translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})">`,
        `<path d="${art.dots}" fill="${color}"/>`,
        `<path d="${art.eyes}" fill="${color}" fill-rule="evenodd"/>`,
    ];

    const g = qrLogoGeometry(art);
    if (g) {
        parts.push(
            `<rect x="${f(g.box.x)}" y="${f(g.box.y)}" width="${f(g.box.size)}" height="${f(g.box.size)}" rx="${f(g.box.rx)}" fill="${QR_GROUND}"/>`,
        );
        const { tile } = g;
        const at = `x="${f(tile.x)}" y="${f(tile.y)}" width="${f(tile.size)}" height="${f(tile.size)}"`;
        if (logo && "dataUrl" in logo) {
            if (/^data:image\//i.test(logo.dataUrl)) {
                parts.push(
                    `<clipPath id="qr-logo"><rect ${at} rx="${f(tile.imageRx)}"/></clipPath>`,
                    `<image ${at} href="${xml(logo.dataUrl)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#qr-logo)"/>`,
                );
            }
        } else if (logo && qrInitials(logo.initials) !== "") {
            parts.push(
                `<rect ${at} rx="${f(tile.rx)}" fill="${QR_TILE_FILL}"/>`,
                `<text x="${f(g.text.x)}" y="${f(g.text.y)}" font-family="${SVG_DISPLAY_FACE}" font-weight="600" font-size="${f(g.text.size)}" fill="${QR_TILE_TEXT}" text-anchor="middle" dominant-baseline="central">${xml(qrInitials(logo.initials))}</text>`,
            );
        }
    }
    parts.push("</g>");

    if (label) {
        // No text measuring here, so the pill's width is an estimate from
        // the letter count, and long labels step the type down to fit.
        const maxWidth = size - 80;
        let type = 68;
        const widthAt = (t: number) => label.length * t * 0.6 + t * 1.8;
        if (widthAt(type) > maxWidth) {
            type = Math.max(24, maxWidth / (label.length * 0.6 + 1.8));
        }
        const width = Math.min(maxWidth, widthAt(type));
        const height = 136;
        const y = codeY + codeSize + 48;
        parts.push(
            `<rect x="${f((size - width) / 2)}" y="${y}" width="${f(width)}" height="${height}" rx="${height / 2}" fill="${color}"/>`,
            `<text x="${size / 2}" y="${y + height / 2}" font-family="${SVG_DISPLAY_FACE}" font-weight="600" font-size="${f(type)}" letter-spacing="${f(-0.02 * type)}" fill="${QR_GROUND}" text-anchor="middle" dominant-baseline="central">${xml(label)}</text>`,
        );
    }

    parts.push("</svg>");
    return parts.join("");
}

/** `#RGB` or `#RRGGBB` (the `#` is optional) as 0–255 channels. */
function channels(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m?.[1]) return null;
    const h =
        m[1].length === 3 ? Array.from(m[1], (c) => c + c).join("") : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
    ];
}

/** WCAG contrast of `hex` against white (1–21), or null when unreadable. */
export function contrastOnWhite(hex: string): number | null {
    const rgb = channels(hex);
    if (!rgb) return null;
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (lum + 0.05);
}

/** The least contrast against white a code may have and still be offered. */
export const QR_MIN_CONTRAST = 4;

/**
 * True when a code in this colour would not scan reliably on white: its
 * contrast is under 4:1. A colour that cannot be read as hex is refused
 * too, since nothing can be said for it.
 */
export function tooLightToScan(hex: string): boolean {
    const contrast = contrastOnWhite(hex);
    return contrast === null || contrast < QR_MIN_CONTRAST;
}

/**
 * The download's file name, without the extension: the business, then
 * `qr`, then the code's id. `("Glow Studio", "h7c")` → `glow-studio-qr-h7c`.
 */
export function qrFileName(business: string, codeId?: string | null): string {
    const slug = (s: string) =>
        s
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return [slug(business), "qr", slug(codeId ?? "")]
        .filter((part) => part !== "")
        .join("-");
}
