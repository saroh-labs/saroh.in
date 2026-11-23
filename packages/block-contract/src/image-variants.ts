import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash";
import { z } from "zod";

/**
 * Photos are sized and given a blur placeholder once, in the merchant's
 * browser, at upload (DEC-246). This is the contract every side reads: the
 * app that makes the files, the API that checks and stores them, the pages
 * that draw them and the backfill for older photos.
 *
 * - A **full** copy, WebP, its longest side at most {@link IMAGE_FULL_MAX_EDGE}.
 *   It keeps the media key the upload was given.
 * - **Smaller copies** at each of {@link IMAGE_VARIANT_WIDTHS} narrower than
 *   the full copy, stored beside it as `<key without .webp>@<width>.webp`.
 * - A **ThumbHash** (about 25 bytes, base64) that turns into a tiny PNG
 *   without a canvas, so the server draws the blur and no script is needed.
 */

/** The smaller copies' widths, smallest first. */
export const IMAGE_VARIANT_WIDTHS = [480, 1200, 1920] as const;

/** The full copy's longest side. */
export const IMAGE_FULL_MAX_EDGE = 2560;

/**
 * The most the full copy may weigh: well under the 5 MB a photo may be
 * when it is sent to Ask AI (Anthropic's per-image limit).
 */
export const IMAGE_FULL_MAX_BYTES = 4 * 1024 * 1024;

/** The WebP quality a copy is first encoded at. */
export const IMAGE_WEBP_QUALITY = 0.8;

/** The longest a stored placeholder may be, in base64 characters. */
export const IMAGE_PLACEHOLDER_MAX = 64;

/** The widths a photo this wide gets copies at: never as wide as itself. */
export function variantWidthsFor(fullWidth: number): number[] {
    return IMAGE_VARIANT_WIDTHS.filter((w) => w < fullWidth);
}

/**
 * The full copy's size for a source of this size: the same, or shrunk so
 * its longest side is `maxEdge`. Never enlarged.
 */
export function fullSizeFor(
    width: number,
    height: number,
    maxEdge: number = IMAGE_FULL_MAX_EDGE,
): { width: number; height: number } {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/**
 * The key of a smaller copy, beside the photo's own: `<id>.webp` has its
 * copies at `<id>@480.webp`; an older photo kept in its own format, given
 * copies by the backfill, at `<id>.jpg@480.webp`. Null for a bad width.
 */
export function variantKey(key: string, width: number): string | null {
    if (!key || !Number.isInteger(width) || width <= 0) return null;
    const stem = key.endsWith(".webp") ? key.slice(0, -".webp".length) : key;
    return `${stem}@${width}.webp`;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(value: string): Uint8Array | null {
    if (value.length % 4 !== 0 || !BASE64.test(value)) return null;
    try {
        const raw = atob(value);
        return Uint8Array.from(raw, (c) => c.charCodeAt(0));
    } catch {
        return null;
    }
}

/**
 * The placeholder's bytes when it is a ThumbHash we would store: base64, at
 * most {@link IMAGE_PLACEHOLDER_MAX} characters, and at least the 5-byte
 * header plus one colour. Null for anything else.
 */
export function placeholderBytes(
    value: string | null | undefined,
): Uint8Array | null {
    if (typeof value !== "string" || value.length > IMAGE_PLACEHOLDER_MAX) {
        return null;
    }
    const bytes = decodeBase64(value);
    return bytes && bytes.length >= 6 ? bytes : null;
}

/**
 * A placeholder from a small copy's pixels (at most 100 px each way, RGBA,
 * not premultiplied), as stored: base64.
 */
export function placeholderFromRgba(
    width: number,
    height: number,
    rgba: ArrayLike<number>,
): string {
    const hash = rgbaToThumbHash(width, height, rgba);
    return btoa(Array.from(hash, (b) => String.fromCharCode(b)).join(""));
}

/** Is this a placeholder we accept? */
export function isValidPlaceholder(value: unknown): value is string {
    return typeof value === "string" && placeholderBytes(value) !== null;
}

/** A placeholder in a request or a section: checked, or absent. */
export const imagePlaceholderSchema = z
    .string()
    .max(IMAGE_PLACEHOLDER_MAX)
    .refine(isValidPlaceholder, "That isn't a photo placeholder");

/** The widths of a photo's stored smaller copies, in a section. */
export const imageWidthsSchema = z
    .array(z.number().int().positive().max(10_000))
    .max(IMAGE_VARIANT_WIDTHS.length);

/**
 * The blur as a tiny PNG data URL, drawn on the server. Null for an
 * invalid placeholder, and for one with transparency: a logo or a cut-out
 * would keep the blur showing through it after it loads.
 */
export function placeholderDataUrl(
    value: string | null | undefined,
): string | null {
    const bytes = placeholderBytes(value);
    if (!bytes) return null;
    const header24 = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
    if ((header24 >> 23) & 1) return null;
    try {
        return thumbHashToDataURL(bytes);
    } catch {
        return null;
    }
}

/** The address of a smaller copy, from the photo's own address. */
export function variantSrc(src: string, width: number): string | null {
    let url: URL;
    try {
        url = new URL(src);
    } catch {
        return null;
    }
    if (url.search || url.hash) return null;
    const path = variantKey(url.pathname, width);
    return path ? `${url.origin}${path}` : null;
}

/**
 * `srcSet` from a photo's stored copies, or null when it has none (an older
 * upload, one from the API, an outside address): the caller keeps what it
 * did before. The full copy closes the set at its own width.
 */
export function storedSrcSet(image: {
    src: string;
    width?: number | null;
    widths?: readonly number[] | null;
}): string | null {
    const own = image.width;
    if (!image.widths?.length || typeof own !== "number" || own <= 0) {
        return null;
    }
    const entries: string[] = [];
    for (const w of [...image.widths].sort((a, b) => a - b)) {
        if (w >= own) continue;
        const src = variantSrc(image.src, w);
        if (!src) return null;
        entries.push(`${src} ${w}w`);
    }
    if (entries.length === 0) return null;
    entries.push(`${image.src} ${Math.round(own)}w`);
    return entries.join(", ");
}

/**
 * The smallest stored copy at least `min` wide, for a thumbnail in the app;
 * the photo itself when it has none.
 */
export function thumbnailSrc(
    src: string,
    widths: readonly number[] | null | undefined,
    min: number = IMAGE_VARIANT_WIDTHS[0],
): string {
    const w = [...(widths ?? [])].sort((a, b) => a - b).find((x) => x >= min);
    return (w === undefined ? null : variantSrc(src, w)) ?? src;
}
