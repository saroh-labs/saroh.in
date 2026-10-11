/**
 * The business logo as a data URL, for the centre of a branded QR code.
 *
 * The media bucket allows no cross-origin GET, so a browser can show the
 * logo in an `<img>` but can't read its bytes, and an SVG or PNG that only
 * pointed at it would be drawn without it once downloaded. The app's server
 * fetches the bytes instead and hands the client a `data:` URL, so the file
 * a merchant downloads is whole on its own.
 *
 * Only what a logo may be (`business-logo.ts`): PNG, JPG or WebP, a little
 * over 1 MB at most, from an `https` address. Anything else is "no logo",
 * and the code is drawn with the business's initials.
 */

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** The logo rule's 1 MB, with room for a file measured a little differently. */
export const QR_LOGO_MAX_BYTES = 1.5 * 1024 * 1024;

/** `image/png; charset=binary` → `image/png`; null for anything not a logo type. */
export function logoType(contentType: string | null): string | null {
    const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    return LOGO_TYPES.includes(type) ? type : null;
}

/** The bytes as `data:<type>;base64,…`. */
export function toDataUrl(type: string, bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return `data:${type};base64,${btoa(binary)}`;
}

/** `https` anywhere; plain `http` only for a local stack's own storage. */
export function mayFetch(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol === "https:") return true;
    const host = parsed.hostname;
    return (
        parsed.protocol === "http:" &&
        (host === "localhost" ||
            host === "127.0.0.1" ||
            host.endsWith(".localhost"))
    );
}

/**
 * Fetch `url` and return it as a data URL, or null when it isn't a logo we
 * can embed or can't be had. Never throws: a code without its logo still
 * scans, and the screen says which it drew.
 */
export async function logoDataUrl(
    url: string | null | undefined,
    fetcher: typeof fetch = fetch,
): Promise<string | null> {
    if (!url) return null;
    try {
        if (!mayFetch(url)) return null;
        const res = await fetcher(url, { cache: "no-store" });
        if (!res.ok) return null;
        const type = logoType(res.headers.get("content-type"));
        if (!type) return null;
        const declared = Number(res.headers.get("content-length") ?? "0");
        if (declared > QR_LOGO_MAX_BYTES) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length === 0 || bytes.length > QR_LOGO_MAX_BYTES) return null;
        return toDataUrl(type, bytes);
    } catch {
        return null;
    }
}
