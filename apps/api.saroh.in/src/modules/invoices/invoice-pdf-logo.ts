import { inflateSync } from "node:zlib";

import type { Logger } from "@nestjs/common";

import type { MediaService } from "../media/media.service";

/**
 * The business logo on the invoice PDF (D16): the image Invoice Detail's
 * paper prints (`BusinessProfile.logoUrl`), read as bytes from storage
 * through its library object (`logoMediaId`) — never fetched over HTTP, so
 * there is no address to point elsewhere.
 *
 * pdfkit embeds PNG and JPEG only, and the API has no image converter, so a
 * WebP logo (which Settings accepts) is left off. A logo that is missing,
 * too big, unreadable, of another kind or slower than
 * {@link LOGO_READ_TIMEOUT_MS} is left off too: the PDF prints the business
 * name alone, as it does for a business with no logo, and never fails over
 * it. Each skip logs one `invoice_pdf_logo_skipped` WARN with the
 * organization and a reason; a steady stream of `unsupported_format` means
 * WebP logos are common enough to convert.
 */

/** Settings caps a logo at 1 MB; this is headroom, not a second rule. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** One ranged GET of a small object; past this the PDF goes without. */
export const LOGO_READ_TIMEOUT_MS = 1500;

export type LogoImageType = "png" | "jpeg";

/** What the bytes are, by their signature — not what the upload said. */
export function logoImageType(bytes: Uint8Array): LogoImageType | null {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) {
        return "png";
    }
    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return "jpeg";
    }
    return null;
}

/** A logo this many pixels is a mistake, not a logo: left off. */
const MAX_PIXELS = 5000 * 5000;

/** Adam7's seven passes: x0, y0, dx, dy. */
const ADAM7 = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
] as const;

/** The parts of png-js's parsed PNG this reads (pdfkit's `image.image`). */
export interface ParsedPng {
    width: number;
    height: number;
    pixelBitlength: number;
    interlaceMethod: number;
    imgData: ArrayLike<number>;
}

/**
 * Would png-js decode these pixels? pdfkit decodes a PNG with transparency
 * or interlacing on a zlib callback, where a broken image throws outside any
 * try — it would take the process down. So the same walk runs here first,
 * synchronously: the data inflates, and every scanline's filter is one PNG
 * knows.
 */
export function pngDecodes(png: ParsedPng): boolean {
    const { width, height } = png;
    if (!(width > 0 && height > 0) || width * height > MAX_PIXELS) {
        return false;
    }
    const pixelBytes = png.pixelBitlength / 8;
    const passes =
        png.interlaceMethod === 1 ? ADAM7 : ([[0, 0, 1, 1]] as const);
    const expected = passes.reduce((sum, [x0, y0, dx, dy]) => {
        const w = Math.ceil((width - x0) / dx);
        const h = Math.ceil((height - y0) / dy);
        return w > 0 && h > 0 ? sum + h * (1 + Math.ceil(pixelBytes * w)) : sum;
    }, 0);
    let data: Buffer;
    try {
        data = inflateSync(Uint8Array.from(png.imgData), {
            maxOutputLength: expected + 1024,
        });
    } catch {
        return false;
    }
    let pos = 0;
    for (const [x0, y0, dx, dy] of passes) {
        const w = Math.ceil((width - x0) / dx);
        const h = Math.ceil((height - y0) / dy);
        if (w <= 0 || h <= 0) continue;
        const scanline = Math.ceil(pixelBytes * w);
        for (let row = 0; row < h && pos < data.length; row++) {
            if (data[pos] > 4) return false;
            pos += 1 + scanline;
        }
    }
    return true;
}

export type LogoSkipReason =
    | "no_library_object"
    | "not_found"
    | "too_large"
    | "unsupported_format"
    | "read_failed"
    | "timed_out"
    | "undecodable";

export function warnLogoSkipped(
    logger: Pick<Logger, "warn">,
    organizationId: string,
    reason: LogoSkipReason,
): void {
    logger.warn(
        `invoice_pdf_logo_skipped: the invoice PDF went out without the business logo (organization ${organizationId}, reason ${reason})`,
    );
}

const TIMED_OUT = Symbol("timed out");

/**
 * The logo's bytes when the business has one pdfkit can print; null
 * otherwise. Never throws.
 */
export async function loadInvoiceLogo(
    media: Pick<MediaService, "readReadyObjectStart">,
    organizationId: string,
    profile: { logoUrl: string | null; logoMediaId: string | null } | null,
    logger: Pick<Logger, "warn">,
    timeoutMs = LOGO_READ_TIMEOUT_MS,
): Promise<Buffer | null> {
    if (!profile?.logoUrl) return null;
    const skip = (reason: LogoSkipReason) => {
        warnLogoSkipped(logger, organizationId, reason);
        return null;
    };
    if (!profile.logoMediaId) return skip("no_library_object");

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    let read: Awaited<ReturnType<MediaService["readReadyObjectStart"]>>;
    try {
        const result = await Promise.race([
            media.readReadyObjectStart(
                organizationId,
                profile.logoMediaId,
                LOGO_MAX_BYTES + 1,
            ),
            timeout,
        ]);
        if (result === TIMED_OUT) return skip("timed_out");
        read = result;
    } catch {
        return skip("read_failed");
    } finally {
        clearTimeout(timer);
    }

    if (!read || read.bytes.length === 0) return skip("not_found");
    if (read.bytes.length > LOGO_MAX_BYTES) return skip("too_large");
    if (!logoImageType(read.bytes)) return skip("unsupported_format");
    return Buffer.from(read.bytes);
}
