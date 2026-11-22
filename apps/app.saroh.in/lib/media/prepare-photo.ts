import {
    fullSizeFor,
    IMAGE_FULL_MAX_BYTES,
    IMAGE_FULL_MAX_EDGE,
    IMAGE_WEBP_QUALITY,
    placeholderFromRgba,
    variantWidthsFor,
} from "@saroh/block-contract";

/**
 * A photo made ready on the merchant's device before it is uploaded
 * (DEC-246): re-drawn, so the camera's metadata (location included) and
 * anything hidden after the picture are left behind; turned upright from
 * its orientation; a full copy no larger than it needs to be, smaller
 * copies for phones, and a blur to show while it loads. No server sees the
 * original.
 */
export interface PreparedPhoto {
    /** What is stored as the photo itself. */
    file: File;
    width: number;
    height: number;
    placeholder?: string;
    /** The smaller copies, narrowest first; none for a GIF. */
    variants: { width: number; blob: Blob }[];
}

/** Qualities tried, in turn, until the full copy is small enough. */
const QUALITIES = [IMAGE_WEBP_QUALITY, 0.7, 0.6, 0.5];

/** Encodes a canvas; injectable so the size rule can be tested. */
export type Encode = (
    canvas: HTMLCanvasElement,
    type: string,
    quality: number,
) => Promise<Blob | null>;

const toBlob: Encode = (canvas, type, quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Re-draw a picked photo, or null when this browser can't (a format it
 * can't open): the original then goes up as it is, as before.
 */
export async function preparePhoto(
    file: File,
    encode: Encode = toBlob,
): Promise<PreparedPhoto | null> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file, {
            imageOrientation: "from-image",
        });
    } catch {
        return null;
    }
    try {
        const placeholder = placeholderOf(bitmap);
        // A GIF keeps its animation: it goes up as it is, with its size
        // and blur. Re-drawing it would keep one frame.
        if (file.type === "image/gif") {
            return {
                file,
                width: bitmap.width,
                height: bitmap.height,
                placeholder,
                variants: [],
            };
        }
        const full = await encodeFull(bitmap, encode);
        if (!full) return null;
        const variants: PreparedPhoto["variants"] = [];
        for (const width of variantWidthsFor(full.width)) {
            const height = Math.max(
                1,
                Math.round((full.height * width) / full.width),
            );
            const blob = await encode(
                draw(bitmap, width, height),
                full.blob.type,
                IMAGE_WEBP_QUALITY,
            );
            // A copy that isn't smaller than the photo is no use: send none.
            if (!blob || blob.size >= full.blob.size) {
                variants.length = 0;
                break;
            }
            variants.push({ width, blob });
        }
        const ext = full.blob.type === "image/webp" ? "webp" : "jpg";
        return {
            file: new File([full.blob], renamed(file.name, ext), {
                type: full.blob.type,
            }),
            width: full.width,
            height: full.height,
            placeholder,
            variants,
        };
    } finally {
        bitmap.close();
    }
}

/**
 * The full copy: WebP (JPEG where the browser can't write WebP), its
 * longest side at most 2560 px, and always under the 5 MB Ask AI takes:
 * the quality steps down, then the size, until it fits.
 */
export async function encodeFull(
    bitmap: { width: number; height: number },
    encode: Encode,
    draws: (w: number, h: number) => HTMLCanvasElement = (w, h) =>
        draw(bitmap as ImageBitmap, w, h),
): Promise<{ blob: Blob; width: number; height: number } | null> {
    let edge = IMAGE_FULL_MAX_EDGE;
    let type = "image/webp";
    sizes: for (let tries = 0; tries < 8; tries++) {
        const size = fullSizeFor(bitmap.width, bitmap.height, edge);
        const canvas = draws(size.width, size.height);
        for (const quality of QUALITIES) {
            const blob = await encode(canvas, type, quality);
            if (!blob) return null;
            // A browser that can't write WebP hands back a PNG: try JPEG
            // at the same size.
            if (blob.type !== type) {
                if (type === "image/jpeg") return null;
                type = "image/jpeg";
                continue sizes;
            }
            if (blob.size <= IMAGE_FULL_MAX_BYTES) return { blob, ...size };
        }
        edge = Math.round(Math.max(size.width, size.height) * 0.75);
    }
    return null;
}

function draw(
    bitmap: ImageBitmap,
    width: number,
    height: number,
): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);
    }
    return canvas;
}

/** The ThumbHash, from a copy at most 100 px each way. */
function placeholderOf(bitmap: ImageBitmap): string | undefined {
    try {
        const scale = Math.min(1, 100 / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = draw(bitmap, w, h).getContext("2d");
        if (!ctx) return undefined;
        return placeholderFromRgba(w, h, ctx.getImageData(0, 0, w, h).data);
    } catch {
        return undefined;
    }
}

function renamed(name: string, ext: string): string {
    const dot = name.lastIndexOf(".");
    return `${dot > 0 ? name.slice(0, dot) : name || "photo"}.${ext}`;
}
