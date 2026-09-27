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

/** Where a link clicked in the editor's Preview goes (G5). */
export type PreviewLinkTarget<P> =
    { kind: "page"; page: P } | { kind: "anchor"; id: string } | null;

/** "/about/" and "/about" are the same page; "" is home. */
function samePath(a: string, b: string): boolean {
    const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
    return norm(a || "/") === norm(b || "/");
}

/** The base a relative link is read against; no real site is ever here. */
const NOWHERE = "preview.invalid";

/**
 * In Preview the canvas is the site, so a link to one of its pages opens that
 * page in the editor rather than a tab (G5).
 *
 * - "#menu" → an anchor on the page being shown.
 * - "/about", "about", "/about/?x#y" → the page at /about, when there is one
 *   among `pages` (pass the pages publish will write, not hidden ones).
 * - "https://<the site's own address>/about" → the same.
 * - Anything else — another site, "mailto:", "/book", a hidden page — → null,
 *   and the caller opens it the way `merchantLinkUrl` says.
 */
export function previewLinkTarget<P extends { path: string }>(
    href: string | null | undefined,
    pages: P[],
    siteAddress: string | null | undefined,
): PreviewLinkTarget<P> {
    const raw = href?.trim();
    if (!raw) return null;
    if (raw.startsWith("#")) {
        const id = raw.slice(1);
        return id ? { kind: "anchor", id } : null;
    }
    let url: URL;
    try {
        url = new URL(raw, `https://${NOWHERE}/`);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const own = siteAddress
        ?.replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .toLowerCase();
    const host = url.host.toLowerCase();
    if (host !== NOWHERE && (!own || host !== own)) return null;
    const page = pages.find((p) => samePath(p.path, url.pathname));
    return page ? { kind: "page", page } : null;
}
