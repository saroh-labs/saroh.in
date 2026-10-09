import { BadRequestException } from "@nestjs/common";
import {
    DEFAULT_ALLOWED_CONTENT_TYPES,
    DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
    hasImageSignature,
    hasIsoBmffSignature,
    isAllowedContentType,
    isVideoContentType,
    VIDEO_UPLOAD_PURPOSE,
} from "@saroh/object-storage";

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
/** What a merchant reads when nothing reached storage. */
export const NOTHING_UPLOADED_MESSAGE =
    "That upload didn't go through. Upload the file again.";

/** The purpose the business logo is uploaded under. */
export const LOGO_UPLOAD_PURPOSE = "business-logo";

/** Input for issuing an upload URL — the validated `CreateUploadDto` shape. */
export interface CreateUploadInput {
    contentType: string;
    contentLength: number;
    filename: string;
    purpose?: string;
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
