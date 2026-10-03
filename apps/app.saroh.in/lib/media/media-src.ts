/**
 * The only addresses a photo or video may load from: the web (`https:`,
 * `http:`) or a file the merchant just picked (`blob:`). Storage always gives
 * an absolute address, so a bare path isn't one; anything else
 * (`javascript:`, `data:`, `/path`, a stray word) draws nothing.
 *
 * Each address is rebuilt behind a fixed scheme rather than passed through,
 * so what reaches `src` can only ever start with one of these three, whatever
 * was typed. Browsers don't run script from an image or video source, so this
 * is defence in depth, not a hole being closed (CodeQL js/xss-through-dom,
 * release #772).
 */
export function mediaSrc(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
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
