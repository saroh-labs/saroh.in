import { z } from "zod";

import type { ContentTypeAllowlist } from "./port";

/**
 * Default content-type allowlist: common image + document types, mapped to a
 * canonical extension. SVG is deliberately excluded (scriptable / XSS risk);
 * an app may pass its own allowlist to the adapter factory to widen or narrow
 * this set.
 */
export const DEFAULT_ALLOWED_CONTENT_TYPES: ContentTypeAllowlist = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
    "text/plain": "txt",
    "text/csv": "csv",
};

/** Default upload cap: 25 MiB. */
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Videos (#517): MP4 and MOV only, and only through the video purpose, so a
 * site image, a logo or an attachment can never be a 50 MB film. No
 * transcoding — what is uploaded is what is served.
 */
export const VIDEO_CONTENT_TYPES: ContentTypeAllowlist = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
};

/** The purpose a video upload must carry. */
export const VIDEO_UPLOAD_PURPOSE = "product-video";

/** Video upload cap: 50 MiB. */
export const DEFAULT_MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Is `contentType` one of the video types? */
export function isVideoContentType(contentType: string): boolean {
    return Object.prototype.hasOwnProperty.call(
        VIDEO_CONTENT_TYPES,
        contentType,
    );
}

/** How many leading bytes {@link hasIsoBmffSignature} needs. */
export const ISO_BMFF_SNIFF_BYTES = 12;

/**
 * Do these leading bytes start an ISO-BMFF file (MP4 and MOV both)? The first
 * box is `ftyp`: a 4-byte big-endian size (at least 8, or 1 for a 64-bit
 * size), then the ASCII type. A file that only says it is video/mp4 — an HTML
 * page, a script — fails.
 */
export function hasIsoBmffSignature(bytes: Uint8Array): boolean {
    if (bytes.length < ISO_BMFF_SNIFF_BYTES) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = view.getUint32(0);
    if (size !== 1 && size < 8) return false;
    return (
        bytes[4] === 0x66 && // f
        bytes[5] === 0x74 && // t
        bytes[6] === 0x79 && // y
        bytes[7] === 0x70 // p
    );
}

/** Is `contentType` permitted by the allowlist? */
export function isAllowedContentType(
    contentType: string,
    allowlist: ContentTypeAllowlist,
): boolean {
    return Object.prototype.hasOwnProperty.call(allowlist, contentType);
}

/** Canonical file extension for a content type, or `undefined` if disallowed. */
export function extensionForContentType(
    contentType: string,
    allowlist: ContentTypeAllowlist,
): string | undefined {
    return isAllowedContentType(contentType, allowlist)
        ? allowlist[contentType]
        : undefined;
}

/** Options that shape the upload-input schema. */
export interface UploadInputSchemaOptions {
    allowlist: ContentTypeAllowlist;
    maxUploadBytes: number;
    /** Cap for a video under {@link VIDEO_UPLOAD_PURPOSE}; 50 MiB unless said. */
    maxVideoUploadBytes?: number;
}

/**
 * Build a zod schema for `createSignedUploadUrl` input, bound to a specific
 * allowlist and size cap. Rejects disallowed content types and over-cap
 * lengths at the boundary — before any key is derived or URL minted.
 */
export function buildUploadInputSchema(options: UploadInputSchemaOptions) {
    const { allowlist, maxUploadBytes } = options;
    const maxVideoUploadBytes =
        options.maxVideoUploadBytes ?? DEFAULT_MAX_VIDEO_UPLOAD_BYTES;

    return z
        .object({
            organizationId: z
                .string()
                .trim()
                .min(1, "organizationId is required"),
            contentType: z.string(),
            contentLength: z
                .number()
                .int("contentLength must be an integer")
                .positive("contentLength must be positive"),
            filename: z.string().trim().min(1, "filename is required").max(255),
            purpose: z
                .string()
                .trim()
                .max(64)
                .regex(/^[a-zA-Z0-9-]+$/, "purpose must be [a-zA-Z0-9-]")
                .optional(),
        })
        .superRefine((input, ctx) => {
            // A video is allowed only under the video purpose, with its own
            // cap; everything else goes by the allowlist and the default cap.
            const video =
                isVideoContentType(input.contentType) &&
                input.purpose === VIDEO_UPLOAD_PURPOSE;
            if (!video && !isAllowedContentType(input.contentType, allowlist)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["contentType"],
                    message: "contentType is not in the allowed list",
                });
            }
            const cap = video ? maxVideoUploadBytes : maxUploadBytes;
            if (input.contentLength > cap) {
                ctx.addIssue({
                    code: "custom",
                    path: ["contentLength"],
                    message: `contentLength exceeds the ${cap}-byte cap`,
                });
            }
        });
}

/** The validated shape produced by {@link buildUploadInputSchema}. */
export type ValidatedUploadInput = z.infer<
    ReturnType<typeof buildUploadInputSchema>
>;
