/**
 * The only addresses a product photo or video may load from: the web
 * (`https:`, `http:`), a file the merchant just picked (`blob:`), or a path on
 * this site. Anything else (`javascript:`, `data:`, a stray word) draws
 * nothing. Browsers don't run script from an image or video source, so this
 * is defence in depth, not a hole being closed (CodeQL js/xss-through-dom,
 * release #772).
 */
export function mediaSrc(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    const value = url.trim();
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return undefined;
    }
    return parsed.protocol === "https:" ||
        parsed.protocol === "http:" ||
        parsed.protocol === "blob:"
        ? parsed.href
        : undefined;
}
