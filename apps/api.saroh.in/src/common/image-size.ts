/**
 * An image's width and height read from its header, before anything decodes
 * it: PNG, JPEG, WebP and GIF. Null when the header can't be read. The
 * upload's own width and height come from the browser, so a decode in the
 * API checks the file itself.
 */
export function imageSize(
    bytes: Uint8Array,
): { width: number; height: number } | null {
    const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const at = (i: number, text: string) =>
        b.length >= i + text.length &&
        b.toString("latin1", i, i + text.length) === text;
    if (b[0] === 0x89 && at(1, "PNG") && b.length >= 24) {
        return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    if (at(0, "GIF8") && b.length >= 10) {
        return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    }
    if (at(0, "RIFF") && at(8, "WEBP")) return webpSize(b);
    if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
    return null;
}

/**
 * The most pixels the API decodes in one image: a share card's photo or
 * logo. Past it the card draws its tile, as for any image it can't read.
 */
export const IMAGE_MAX_PIXELS = 5000 * 5000;

/** The most bytes of one image the API reads to decode. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Whether an image may be decoded: within {@link IMAGE_MAX_BYTES}, and its
 * header says it fits {@link IMAGE_MAX_PIXELS}.
 */
export function withinImageLimits(bytes: Uint8Array): boolean {
    const size = bytes.length <= IMAGE_MAX_BYTES ? imageSize(bytes) : null;
    return (
        size !== null &&
        size.width > 0 &&
        size.height > 0 &&
        size.width * size.height <= IMAGE_MAX_PIXELS
    );
}

function webpSize(b: Buffer): { width: number; height: number } | null {
    if (b.length < 30) return null;
    const chunk = b.toString("latin1", 12, 16);
    if (chunk === "VP8 ") {
        return {
            width: b.readUInt16LE(26) & 0x3fff,
            height: b.readUInt16LE(28) & 0x3fff,
        };
    }
    if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >> 14) & 0x3fff) + 1,
        };
    }
    if (chunk === "VP8X") {
        return {
            width: b.readUIntLE(24, 3) + 1,
            height: b.readUIntLE(27, 3) + 1,
        };
    }
    return null;
}

/** The first frame header's size (SOF0–SOF15, not DHT, JPG or DAC). */
function jpegSize(b: Buffer): { width: number; height: number } | null {
    let i = 2;
    while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker === 0xff) {
            i += 1;
            continue;
        }
        if (
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc
        ) {
            return {
                height: b.readUInt16BE(i + 5),
                width: b.readUInt16BE(i + 7),
            };
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
            i += 2;
            continue;
        }
        i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
}
