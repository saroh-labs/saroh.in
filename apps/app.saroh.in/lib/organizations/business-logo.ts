/**
 * What a business logo may be, checked before the upload starts so a wrong
 * file is said at once rather than after the bytes have gone. The API holds
 * the same rule (`business-logo.ts`): PNG, JPG or WebP, 1 MB at most. No
 * SVG — the storage allowlist leaves it out, since an SVG can carry script.
 */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

const LOGO_TYPES = LOGO_ACCEPT.split(",");

/** 1 MB. */
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Why a picked file cannot be the logo, in the words the row shows; or null. */
export function logoFileProblem(file: {
    type: string;
    size: number;
}): string | null {
    if (!LOGO_TYPES.includes(file.type)) {
        return "That file isn't a PNG, JPG or WebP image.";
    }
    if (file.size > LOGO_MAX_BYTES) {
        return `That image is ${(file.size / LOGO_MAX_BYTES).toFixed(1)} MB — keep it under 1 MB.`;
    }
    return null;
}
