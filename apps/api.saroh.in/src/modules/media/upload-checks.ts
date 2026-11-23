import { BadRequestException } from "@nestjs/common";
import {
    IMAGE_FULL_MAX_BYTES,
    IMAGE_FULL_MAX_EDGE,
    isValidPlaceholder,
    variantWidthsFor,
} from "@saroh/block-contract";
import {
    DEFAULT_ALLOWED_CONTENT_TYPES,
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
    hasImageSignature,
    hasIsoBmffSignature,
    imageEndsCleanly,
    isAllowedContentType,
    isVideoContentType,
    VIDEO_UPLOAD_PURPOSE,
} from "@saroh/object-storage";

import {
    ASK_AI_IMAGE_MAX_BYTES,
    ASK_AI_IMAGE_PURPOSE,
    ASK_AI_IMAGE_TYPES,
    ASK_AI_SENT_PURPOSE,
} from "@saroh/api-contract";

import { LOGO_CONTENT_TYPES } from "../organizations/business-logo";

/**
 * What a file may be, said in the merchant's words (#517, #873). The storage
 * port holds the same allowlist and would refuse a wrong type too, but as a
 * server error; these say it first, plainly, and the screens show them as
 * they are.
 */

/** What a merchant reads when a file is neither a photo nor a video. */
export const NOT_PHOTO_OR_VIDEO_MESSAGE =
    "That is not a photo or a video. Choose a JPG, PNG, WebP, MP4 or MOV.";
/** What a merchant reads when a video is over the cap. */
export const VIDEO_TOO_BIG_MESSAGE =
    "That video is over 50 MB. Keep it under a minute, or export it smaller.";
/** What a merchant reads when a photo is over the cap. */
export const IMAGE_TOO_BIG_MESSAGE =
    "That photo is over 10 MB. Export it smaller and upload it again.";
/** What a merchant reads when a "video" turns out not to be one. */
export const NOT_A_VIDEO_MESSAGE =
    "That file is not a video we can show. Choose an MP4 or MOV.";
/** What a merchant reads when a "photo" turns out not to be one. */
export const NOT_AN_IMAGE_MESSAGE =
    "That file is not a photo we can show. Choose a JPG, PNG, WebP, GIF or AVIF.";
/**
 * What a merchant reads when a logo is not one of the logo's types — the
 * words Settings → Business already uses before an upload starts.
 */
export const NOT_A_LOGO_MESSAGE = "That file isn't a PNG, JPG or WebP image.";
/** What a person reads when an Ask AI image is not one Ask AI can read. */
export const ASK_AI_NOT_IMAGE_MESSAGE =
    "Choose a JPG, PNG, WebP or GIF. Ask AI can't read other files.";
export const ASK_AI_TOO_BIG_MESSAGE = "Each image can be up to 5 MB.";
/** What a merchant reads when nothing reached storage. */
export const NOTHING_UPLOADED_MESSAGE =
    "That upload didn't go through. Upload the file again.";

/** The purpose the business logo is uploaded under. */
export const LOGO_UPLOAD_PURPOSE = "business-logo";

/**
 * What a merchant reads when the copies the browser made don't add up — a
 * fault in the app, not something they did, so it says to try again.
 */
export const BAD_SIZES_MESSAGE =
    "We couldn't get that photo ready. Choose it again.";

/** What a browser re-draws a photo as: WebP, or JPEG where it can't. */
const COPY_TYPES = new Set(["image/webp", "image/jpeg"]);

/** Input for issuing an upload URL — the validated `CreateUploadDto` shape. */
export interface CreateUploadInput {
    contentType: string;
    contentLength: number;
    filename: string;
    purpose?: string;
    /** The stored copy's size in pixels, and its ThumbHash (DEC-246). */
    width?: number;
    height?: number;
    placeholder?: string;
    /** The smaller WebP copies the browser made, narrowest first. */
    variants?: { width: number; contentLength: number }[];
}

/**
 * Do the sizes and copies an upload declares agree (DEC-246)? Checked
 * before anything is signed:
 *
 * - a size is both width and height, the longest side within the full
 *   copy's cap; a placeholder is a ThumbHash;
 * - copies come only with a photo the browser re-drew, under 4 MB, (WebP, or JPEG where
 *   it can't write WebP) of known width, and are exactly
 *   the ladder's widths below it, narrowest first (none missing, none
 *   extra, none out of order), each smaller in bytes than the photo.
 */
export function uploadSizesProblem(input: CreateUploadInput): string | null {
    const sized = input.width !== undefined || input.height !== undefined;
    if (sized) {
        if (input.width === undefined || input.height === undefined) {
            return BAD_SIZES_MESSAGE;
        }
        if (isVideoContentType(input.contentType)) return BAD_SIZES_MESSAGE;
    }
    if (
        input.placeholder !== undefined &&
        !isValidPlaceholder(input.placeholder)
    ) {
        return BAD_SIZES_MESSAGE;
    }
    const variants = input.variants;
    if (variants === undefined || variants.length === 0) return null;
    if (!COPY_TYPES.has(input.contentType) || input.width === undefined) {
        return BAD_SIZES_MESSAGE;
    }
    // The browser's full copy stays well under the 5 MB Ask AI takes.
    if (
        Math.max(input.width, input.height ?? 0) > IMAGE_FULL_MAX_EDGE ||
        input.contentLength > IMAGE_FULL_MAX_BYTES
    ) {
        return BAD_SIZES_MESSAGE;
    }
    const expected = variantWidthsFor(input.width);
    if (
        variants.length !== expected.length ||
        variants.some(
            (v, i) =>
                v.width !== expected[i] ||
                v.contentLength >= input.contentLength,
        )
    ) {
        return BAD_SIZES_MESSAGE;
    }
    return null;
}

/**
 * Is this a file the library takes, before anything is signed?
 *
 * A video goes through the video purpose, is an MP4 or MOV, and is at most
 * 50 MB (#517). A photo is one of the storage allowlist's images — no SVG,
 * which can carry script and the bucket serves as given, and no HEIC or
 * other type a browser can't show. A logo is narrower still: PNG, JPG or
 * WebP, as Settings → Business says (`business-logo.ts`).
 */
export function assertUploadType(input: CreateUploadInput): void {
    const video = isVideoContentType(input.contentType);
    if (video || input.purpose === VIDEO_UPLOAD_PURPOSE) {
        if (!video) throw new BadRequestException(NOT_PHOTO_OR_VIDEO_MESSAGE);
        if (input.purpose !== VIDEO_UPLOAD_PURPOSE) {
            throw new BadRequestException(
                "Videos go on a product. Add it under the product's Photos and videos.",
            );
        }
        if (input.contentLength > DEFAULT_MAX_VIDEO_UPLOAD_BYTES) {
            throw new BadRequestException(VIDEO_TOO_BIG_MESSAGE);
        }
        return;
    }
    // Only the server moves an image to "sent", when a question carries it.
    if (input.purpose === ASK_AI_SENT_PURPOSE) {
        throw new BadRequestException(NOT_AN_IMAGE_MESSAGE);
    }
    // An image for Ask AI: what the provider reads, at its per-image size.
    if (input.purpose === ASK_AI_IMAGE_PURPOSE) {
        // Smaller copies are for the library's pages; a chat image has none.
        if (input.variants?.length) {
            throw new BadRequestException(NOT_AN_IMAGE_MESSAGE);
        }
        if (
            !(ASK_AI_IMAGE_TYPES as readonly string[]).includes(
                input.contentType,
            )
        ) {
            throw new BadRequestException(ASK_AI_NOT_IMAGE_MESSAGE);
        }
        if (input.contentLength > ASK_AI_IMAGE_MAX_BYTES) {
            throw new BadRequestException(ASK_AI_TOO_BIG_MESSAGE);
        }
        return;
    }
    // Every non-video (photo or logo) shares the image cap. Without this an
    // over-cap image passed to the storage port, which threw as a 500.
    if (input.contentLength > DEFAULT_MAX_UPLOAD_BYTES) {
        throw new BadRequestException(IMAGE_TOO_BIG_MESSAGE);
    }
    if (input.purpose === LOGO_UPLOAD_PURPOSE) {
        if (!LOGO_CONTENT_TYPES.includes(input.contentType)) {
            throw new BadRequestException(NOT_A_LOGO_MESSAGE);
        }
        return;
    }
    if (
        !isAllowedContentType(input.contentType, DEFAULT_ALLOWED_CONTENT_TYPES)
    ) {
        throw new BadRequestException(NOT_AN_IMAGE_MESSAGE);
    }
}

/**
 * Why the stored bytes are not the file the upload said, or null when they
 * are (#517, #873).
 *
 * The type on an upload is the client's word, and the bucket is public by
 * address: a page or a script sent as image/png — or a text file renamed
 * `.png` — would otherwise be served from our storage. Each format opens
 * with its own magic number, so the first bytes settle it.
 *
 * `start` is null when nothing could be read. On storage that sees a
 * browser's upload (R2) that means nothing was stored, and the upload is
 * refused. The in-memory storage of local development never sees the PUT,
 * so a photo goes on there as before; a video never does.
 */
export function storedBytesProblem(
    media: { contentType: string; purpose: string | null },
    start: Uint8Array | null,
    seesUploads: boolean,
): string | null {
    if (isVideoContentType(media.contentType)) {
        return start !== null && hasIsoBmffSignature(start)
            ? null
            : NOT_A_VIDEO_MESSAGE;
    }
    if (start === null) {
        return seesUploads ? NOTHING_UPLOADED_MESSAGE : null;
    }
    if (hasImageSignature(media.contentType, start)) return null;
    return media.purpose === LOGO_UPLOAD_PURPOSE
        ? NOT_A_LOGO_MESSAGE
        : NOT_AN_IMAGE_MESSAGE;
}

/**
 * Why a stored file is not the whole of what its format says, or null when
 * it is (DEC-246): the bytes past where the image ends are refused — a zip
 * or a page tucked after a photo. Every image, from the browser or the API.
 * `end` null means its tail could not be read: refused where storage sees
 * uploads, let through on local development's in-memory storage.
 */
export function storedEndProblem(
    media: { contentType: string; purpose: string | null },
    start: Uint8Array | null,
    end: Uint8Array | null,
    size: number | undefined,
    seesUploads: boolean,
): string | null {
    if (isVideoContentType(media.contentType)) return null;
    if (start === null || end === null || size === undefined) {
        return seesUploads ? NOTHING_UPLOADED_MESSAGE : null;
    }
    if (imageEndsCleanly(media.contentType, start, end, size)) return null;
    return media.purpose === LOGO_UPLOAD_PURPOSE
        ? NOT_A_LOGO_MESSAGE
        : NOT_AN_IMAGE_MESSAGE;
}
