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
}

/**
 * Build a zod schema for `createSignedUploadUrl` input, bound to a specific
 * allowlist and size cap. Rejects disallowed content types and over-cap
 * lengths at the boundary — before any key is derived or URL minted.
 */
export function buildUploadInputSchema(options: UploadInputSchemaOptions) {
    const { allowlist, maxUploadBytes } = options;

    return z.object({
        organizationId: z.string().trim().min(1, "organizationId is required"),
        contentType: z
            .string()
            .refine((ct) => isAllowedContentType(ct, allowlist), {
                message: "contentType is not in the allowed list",
            }),
        contentLength: z
            .number()
            .int("contentLength must be an integer")
            .positive("contentLength must be positive")
            .max(
                maxUploadBytes,
                `contentLength exceeds the ${maxUploadBytes}-byte cap`,
            ),
        filename: z.string().trim().min(1, "filename is required").max(255),
        purpose: z
            .string()
            .trim()
            .max(64)
            .regex(/^[a-zA-Z0-9-]+$/, "purpose must be [a-zA-Z0-9-]")
            .optional(),
    });
}

/** The validated shape produced by {@link buildUploadInputSchema}. */
export type ValidatedUploadInput = z.infer<
    ReturnType<typeof buildUploadInputSchema>
>;
