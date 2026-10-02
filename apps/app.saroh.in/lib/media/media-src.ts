/**
 * The only addresses a photo or video may load from: the web (`https:`,
 * `http:`), a file the merchant just picked (`blob:`), or a path on this
 * site. Anything else (`javascript:`, `data:`, a stray word) draws nothing.
 *
 * Each address is rebuilt behind a fixed scheme rather than passed through,
 * so what reaches `src` can only ever start with one of these four, whatever
 * was typed. Browsers don't run script from an image or video source, so this
 * is defence in depth, not a hole being closed (CodeQL js/xss-through-dom,
 * release #772).
 */
export function mediaSrc(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    const value = url.trim();
    if (value.startsWith("/") && !value.startsWith("//")) {
        return `/${value.slice(1)}`;
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return undefined;
    }
    const rest = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (parsed.protocol === "https:") return `https://${rest}`;
    if (parsed.protocol === "http:") return `http://${rest}`;
    // A picked file's address is "blob:" and the page's own origin and id.
    if (parsed.protocol === "blob:") return `blob:${parsed.pathname}`;
    return undefined;
}
