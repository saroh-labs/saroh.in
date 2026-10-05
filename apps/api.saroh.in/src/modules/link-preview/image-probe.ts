import type { FetchDeps } from "./safe-fetch";
import { guardedFetch } from "./safe-fetch";

/**
 * What the share picture is, without downloading it (resources plan U2):
 * one ranged GET for its first {@link PROBE_BYTES} bytes through the same
 * guard as the page, read for the size the file's own header states, its
 * type, and its length from `Content-Range` (or `Content-Length`). A server
 * that ignores the range still sends no more than that: the read stops.
 */

export const PROBE_BYTES = 96 * 1024;
export const PROBE_TIMEOUT_MS = 2_500;

export interface ImageFacts {
    url: string;
    /** false: it answered with an error or isn't a picture. null: we couldn't tell in time. */
    loads: boolean | null;
    width: number | null;
    height: number | null;
    /** The MIME type, e.g. `image/jpeg`. */
    type: string | null;
    /** The whole file's size, when the server said. */
    bytes: number | null;
}

interface Size {
    width: number;
    height: number;
    type: string;
}

function png(b: Buffer): Size | null {
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
    if (b.toString("ascii", 12, 16) !== "IHDR") return null;
    return {
        width: b.readUInt32BE(16),
        height: b.readUInt32BE(20),
        type: "image/png",
    };
}

function gif(b: Buffer): Size | null {
    if (b.length < 10 || b.toString("ascii", 0, 3) !== "GIF") return null;
    return {
        width: b.readUInt16LE(6),
        height: b.readUInt16LE(8),
        type: "image/gif",
    };
}

function webp(b: Buffer): Size | null {
    if (b.length < 30) return null;
    if (
        b.toString("ascii", 0, 4) !== "RIFF" ||
        b.toString("ascii", 8, 12) !== "WEBP"
    ) {
        return null;
    }
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") {
        return {
            width: b.readUInt16LE(26) & 0x3fff,
            height: b.readUInt16LE(28) & 0x3fff,
            type: "image/webp",
        };
    }
    if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >> 14) & 0x3fff) + 1,
            type: "image/webp",
        };
    }
    if (chunk === "VP8X") {
        return {
            width: 1 + b.readUIntLE(24, 3),
            height: 1 + b.readUIntLE(27, 3),
            type: "image/webp",
        };
    }
    return null;
}

/** Start-of-frame markers: every SOFn but DHT (C4), JPG (C8) and DAC (CC). */
const SOF = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
]);

function jpeg(b: Buffer): Size | null {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker === 0xff) {
            i += 1; // fill byte
            continue;
        }
        const length = b.readUInt16BE(i + 2);
        if (SOF.has(marker)) {
            return {
                height: b.readUInt16BE(i + 5),
                width: b.readUInt16BE(i + 7),
                type: "image/jpeg",
            };
        }
        i += 2 + length;
    }
    return null;
}

/** The size a picture's header states, from its first bytes; null when it doesn't say there. */
export function imageSize(head: Buffer): Size | null {
    return png(head) ?? jpeg(head) ?? gif(head) ?? webp(head);
}

/** The whole file's length from `Content-Range: bytes 0-n/total`, else `Content-Length` on a 200. */
function totalBytes(
    status: number,
    headers: Record<string, string | undefined>,
): number | null {
    const range = /\/(\d+)\s*$/.exec(headers["content-range"] ?? "");
    if (range?.[1]) return Number(range[1]);
    const length = headers["content-length"];
    if (status === 200 && length && /^\d+$/.test(length.trim()))
        return Number(length.trim());
    return null;
}

/**
 * Probe the share picture. Never throws; what couldn't be learned is null,
 * and the page's own `og:image:width`/`height` fill a size the file's
 * header didn't give.
 */
export async function probeImage(
    url: string,
    declared: {
        width: number | null;
        height: number | null;
        type: string | null;
    },
    deps: FetchDeps,
    headers: Record<string, string>,
): Promise<ImageFacts> {
    const fallback: ImageFacts = {
        url,
        loads: null,
        width: declared.width,
        height: declared.height,
        type: declared.type,
        bytes: null,
    };
    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return { ...fallback, loads: false };
    }
    const outcome = await guardedFetch(
        target,
        {
            maxBytes: PROBE_BYTES,
            timeoutMs: PROBE_TIMEOUT_MS,
            headers: {
                ...headers,
                Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
                Range: `bytes=0-${PROBE_BYTES - 1}`,
            },
        },
        deps,
    );
    if (!outcome.ok) {
        // A picture on a private address is one no app can load either.
        return outcome.failure === "timeout"
            ? fallback
            : { ...fallback, loads: false };
    }
    if (outcome.status !== 200 && outcome.status !== 206) {
        return { ...fallback, loads: false };
    }
    const contentType =
        outcome.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ??
        null;
    const size = imageSize(outcome.body);
    if (contentType && !contentType.startsWith("image/") && !size) {
        return { ...fallback, loads: false };
    }
    return {
        url,
        loads: true,
        width: size?.width ?? declared.width,
        height: size?.height ?? declared.height,
        type: size?.type ?? contentType ?? declared.type,
        bytes: totalBytes(outcome.status, outcome.headers),
    };
}
