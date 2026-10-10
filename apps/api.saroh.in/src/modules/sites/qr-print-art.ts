import { encode, QrCodeDataType } from "uqr";

/**
 * A link drawn as a QR code, for the print files (`qr-print.ts`): the same
 * shapes the workspace and the downloads draw, as paths pdfkit fills.
 *
 * THIS IS A COPY of `packages/ui/src/lib/qr-art.ts` (`qrArt`,
 * `qrLogoGeometry`, `qrInitials`): the API can't import a UI package, and
 * the code on the paper has to be the one the screen showed. Every number
 * and every rule here is that file's, and must change with it:
 *
 * - error correction H; a quiet zone of 4 modules;
 * - PLAIN: unit squares and square eyes;
 * - BRANDED: dots of radius .42, finder eyes as nested rounded squares
 *   (7, 5 and 3 modules; radii 2, 1.3 and .9), each whole alignment pattern
 *   as a small eye (5, 3 and 1 modules; radii 1.4, .8 and .5);
 * - the logo box is `round(n * 0.22)` modules made odd, with one module of
 *   white around it, and a code with a logo is at least version 3.
 *
 * Why those numbers scan is measured and written down there, not here.
 * `qr-print-art.spec.ts` reads that file and fails when a number differs,
 * and both sides pin the same drawn paths for one link
 * (`packages/ui/src/lib/qr-art.pin.test.ts`), so the two can't drift
 * unnoticed.
 */

export type QrArtStyle = "plain" | "branded";

export interface QrPrintArt {
    /** Modules along one side, without the quiet zone. 0 when empty. */
    n: number;
    /** The data modules, one mark each, as an SVG path. */
    dots: string;
    /** The eyes, as an SVG path; fill with the even-odd rule. */
    eyes: string;
    /** The white box knocked out of the centre, in modules; null: none. */
    logoBox: { x: number; y: number; size: number } | null;
}

/** Modules of white around the code. */
export const QR_QUIET_ZONE = 4;
/** The ground a code is drawn on. */
export const QR_GROUND = "#FFFFFF";
/** The initials tile: Ink with Paper letters. */
export const QR_TILE_FILL = "#1C1C1A";
export const QR_TILE_TEXT = "#F5F2EC";
/** A branded dot's radius, in modules. */
export const QR_DOT_RADIUS = 0.42;
/** A finder eye's three squares: side and, when branded, corner radius. */
export const QR_EYE_SIDES = [7, 5, 3] as const;
export const QR_EYE_RADII = [2, 1.3, 0.9] as const;
/** A branded alignment pattern's three squares, as one small eye. */
export const QR_ALIGNMENT_SIDES = [5, 3, 1] as const;
export const QR_ALIGNMENT_RADII = [1.4, 0.8, 0.5] as const;
/** The logo tile's share of the code's side, before it is made odd. */
export const QR_LOGO_SHARE = 0.22;
/** With a logo the code is at least this version (29 modules). */
export const QR_LOGO_MIN_VERSION = 3;
/** Corner radii as shares of their square: the box, the tile, an image. */
export const QR_LOGO_BOX_RADIUS = 0.18;
export const QR_LOGO_TILE_RADIUS = 0.22;
export const QR_LOGO_IMAGE_RADIUS = 0.14;
/** The initials' type size as a share of the tile. */
export const QR_LOGO_TEXT_SIZE = 0.4;

/** A finder pattern with its separator: 8 modules at three corners. */
const FINDER = 8;

/** Trims float noise so the same input always writes the same path. */
const f = (v: number): string => String(Math.round(v * 1000) / 1000);

export function emptyQrPrintArt(): QrPrintArt {
    return { n: 0, dots: "", eyes: "", logoBox: null };
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
    return QR_EYE_SIDES.map((side, i) =>
        rr(x + i, y + i, side, side, rounded ? (QR_EYE_RADII[i] ?? 0) : 0),
    ).join("");
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

/** The logo box for a code of `n` modules: the tile, plus 1 around. */
function logoBoxOf(n: number): { x: number; y: number; size: number } {
    let tile = Math.round(n * QR_LOGO_SHARE);
    if (tile % 2 === 0) tile += 1;
    const start = (n - tile) / 2;
    return { x: start - 1, y: start - 1, size: tile + 2 };
}

/**
 * Draws `text` as QR art. Empty text, or text too long for any QR, gives
 * {@link emptyQrPrintArt}.
 */
export function qrPrintArt(
    text: string,
    options: { style?: QrArtStyle; logo?: boolean } = {},
): QrPrintArt {
    const { style = "plain", logo = false } = options;
    if (typeof text !== "string" || text.trim() === "") {
        return emptyQrPrintArt();
    }

    let data: boolean[][];
    let types: QrCodeDataType[][];
    try {
        ({ data, types } = encode(text, {
            ecc: "H",
            border: 0,
            minVersion: logo ? QR_LOGO_MIN_VERSION : 1,
        }));
    } catch {
        // uqr throws when the text does not fit version 40.
        return emptyQrPrintArt();
    }
    const n = data.length;
    if (n === 0) return emptyQrPrintArt();

    const rounded = style === "branded";
    const box = logo ? logoBoxOf(n) : null;
    const inBox = (row: number, col: number) =>
        box !== null &&
        row >= box.y &&
        row < box.y + box.size &&
        col >= box.x &&
        col < box.x + box.size;

    // Branded: each alignment pattern that is whole (clear of the logo box)
    // is one small eye. One the box cuts into keeps solid squares for the
    // modules that are left, which read the same.
    const isAlignment = (row: number, col: number) =>
        types[row]?.[col] === QrCodeDataType.Alignment;
    const smallEyes: string[] = [];
    const inSmallEye = new Set<number>();
    if (rounded) {
        const around = [-2, -1, 0, 1, 2];
        const [ring, hole, centre] = QR_ALIGNMENT_RADII;
        const [ringSide, holeSide, centreSide] = QR_ALIGNMENT_SIDES;
        for (let row = 2; row < n - 2; row++) {
            for (let col = 2; col < n - 2; col++) {
                const whole = around.every((dr) =>
                    around.every(
                        (dc) =>
                            isAlignment(row + dr, col + dc) &&
                            !inBox(row + dr, col + dc),
                    ),
                );
                if (!whole) continue;
                for (const dr of around) {
                    for (const dc of around) {
                        inSmallEye.add((row + dr) * n + col + dc);
                    }
                }
                smallEyes.push(
                    rr(col - 2, row - 2, ringSide, ringSide, ring) +
                        rr(col - 1, row - 1, holeSide, holeSide, hole) +
                        rr(col, row, centreSide, centreSide, centre),
                );
            }
        }
    }

    const r = QR_DOT_RADIUS;
    const arc = `a${f(r)} ${f(r)} 0 1 0`;
    const dot = `${arc} ${f(2 * r)} 0${arc} ${f(-2 * r)} 0z`;
    const dots: string[] = [];
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            if (!data[row]?.[col]) continue;
            if (isQrFinderCell(n, row, col) || inBox(row, col)) continue;
            if (inSmallEye.has(row * n + col)) continue;
            dots.push(
                rounded && !isAlignment(row, col)
                    ? `M${f(col + 0.5 - r)} ${f(row + 0.5)}${dot}`
                    : `M${col} ${row}h1v1h-1z`,
            );
        }
    }

    return {
        n,
        dots: dots.join(""),
        eyes:
            eye(0, 0, rounded) +
            eye(n - 7, 0, rounded) +
            eye(0, n - 7, rounded) +
            smallEyes.join(""),
        logoBox: box,
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

/** Where the logo goes, in modules. Null when the art has no box. */
export function qrLogoGeometry(art: QrPrintArt): QrLogoGeometry | null {
    const box = art.logoBox;
    if (!box) return null;
    const tile = box.size - 2;
    const mid = box.x + box.size / 2;
    return {
        box: { ...box, rx: box.size * QR_LOGO_BOX_RADIUS },
        tile: {
            x: box.x + 1,
            y: box.y + 1,
            size: tile,
            rx: tile * QR_LOGO_TILE_RADIUS,
            imageRx: tile * QR_LOGO_IMAGE_RADIUS,
        },
        text: { x: mid, y: mid, size: tile * QR_LOGO_TEXT_SIZE },
    };
}

/** At most two letters fit the tile. */
export function qrInitials(initials: string): string {
    return Array.from(initials.trim()).slice(0, 2).join("");
}

/**
 * The letters a business with no printable logo gets on its tile: the first
 * letter of its first two words. "Glow Studio" → "GS", "Rye" → "R".
 */
export function initialsOf(name: string): string {
    const words = name
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word !== "")
        .slice(0, 2);
    return qrInitials(
        words.map((word) => Array.from(word)[0] ?? "").join(""),
    ).toUpperCase();
}
