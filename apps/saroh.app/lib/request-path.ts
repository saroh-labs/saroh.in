/**
 * The path a visitor asked for, carried from the middleware to the tenant
 * layout (DEC-069, plan L3; KTD-5).
 *
 * The `[domain]` layout sees only its `domain` param, never the rest of the
 * URL. When a host has no live site but is an old address that forwards
 * (`GET public/sites/moved/:address`), the layout sends the visitor to the
 * same page on the new address, so it needs the path and query. The
 * middleware names them in {@link REQUEST_PATH_HEADER} on its tenant
 * rewrite; one a visitor sent is replaced there, or dropped on the apex.
 *
 * Pure, so the middleware (edge) and the layout share it and a unit test can
 * reach it without either runtime.
 */

/** The request header naming the path and query a tenant page was asked for. */
export const REQUEST_PATH_HEADER = "x-saroh-request-path";

/** What the middleware puts in the header: the path, then any query. */
export function requestPathOf(url: URL): string {
    return `${url.pathname}${url.search}`;
}

/**
 * The header's value if it is a path on this host, else `/`.
 *
 * Only a path that starts with one `/` is kept. `//evil.com` and `/\evil.com`
 * are hosts to a browser, so a Location built from them would leave the
 * business's address; they, a full URL, a control character and an empty
 * value all fall back to the root.
 */
export function safeRequestPath(raw: string | null | undefined): string {
    if (!raw?.startsWith("/")) return "/";
    if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
    // eslint-disable-next-line no-control-regex -- refusing them is the point
    if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
    return raw;
}

/**
 * Where an old address sends a visitor: the same path and query on `to`,
 * the new address's origin as the API gave it. Null when `to` is not an
 * http(s) origin, and the page then 404s as it would have.
 */
export function movedLocation(
    to: string,
    requestPath: string | null | undefined,
): string | null {
    let origin: URL;
    try {
        origin = new URL(to);
    } catch {
        return null;
    }
    if (origin.protocol !== "https:" && origin.protocol !== "http:") {
        return null;
    }
    // Resolved against the origin alone: a safe path can't change the host.
    return new URL(safeRequestPath(requestPath), origin.origin).toString();
}
