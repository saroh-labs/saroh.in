/**
 * What a business logo may be. It is uploaded to the library like any image
 * (`MediaService`) and then set as the logo, which is where these are held.
 *
 * No SVG: the storage allowlist leaves it out on purpose — an SVG can carry
 * script, and the bucket serves what it is given — so a logo is a picture
 * the bucket already takes. Under 1 MB: it prints at 36px on an invoice.
 */
export const LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** 1 MB. */
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Why a library object cannot be the logo, or null. */
export function logoProblem(media: {
    contentType: string;
    sizeBytes: number;
}): string | null {
    if (!LOGO_CONTENT_TYPES.includes(media.contentType)) {
        return "A logo is a PNG, JPG or WebP image.";
    }
    if (media.sizeBytes > LOGO_MAX_BYTES) {
        return "A logo is under 1 MB. Choose a smaller image.";
    }
    return null;
}
