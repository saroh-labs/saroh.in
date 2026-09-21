/**
 * Where a link on the merchant's page really goes (#336 review).
 *
 * The editor draws the merchant's page inside Saroh, so a link written as
 * "/about" means THEIR /about — followed as-is it would open Saroh's own
 * /about, or a 404. This resolves it against the merchant's site address.
 *
 * - "/about", "about", "#menu", "?q=1" → on the merchant's site.
 * - "https://…", "http://…" → unchanged; it already names a site.
 * - "mailto:", "tel:", "https://wa.me/…" → unchanged.
 * - Anything else ("javascript:", "data:") → null: never opened.
 *
 * Returns null too when the site has no address yet: there is nowhere for a
 * relative link to go.
 */
export function merchantLinkUrl(
    href: string | null | undefined,
    siteAddress: string | null | undefined,
): string | null {
    const raw = href?.trim();
    if (!raw) return null;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase();
    if (scheme !== undefined) {
        return ["http", "https", "mailto", "tel"].includes(scheme) ? raw : null;
    }
    // Protocol-relative ("//host/path") names a site of its own.
    if (raw.startsWith("//")) return `https:${raw}`;
    if (!siteAddress) return null;
    const base = `https://${siteAddress.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
    try {
        return new URL(raw, `${base}/`).toString();
    } catch {
        return null;
    }
}
