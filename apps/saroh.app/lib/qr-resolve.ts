/**
 * A QR code's short link, `/q/<code>` on a merchant's address: ask the API
 * where the code goes (it counts the scan), and build the redirect.
 *
 * Pure, with the fetch passed in, so the rules are tested without a server:
 *
 * - The Location is always absolute (a relative one throws on the edge
 *   runtime), on the origin the visitor asked, and never leaves it.
 * - A page a scan opens carries `?src=qr-<code>`, which a booking or an
 *   order made from that page sends back; the home page a retired code
 *   falls back to does not.
 * - The visitor is never shown an error: when the API can't be reached or
 *   answers anything unexpected, the scan forwards to the home page,
 *   uncounted. Only a code the site doesn't have is a 404.
 */

/** What a code is made of, as a link may carry it (the API's rule). */
export const QR_CODE_SHAPE = /^[0-9a-z]{3,6}$/;

/** The tag's query parameter and prefix: `?src=qr-<code>`. */
export const QR_SOURCE_PARAM = "src";
export const QR_SOURCE_PREFIX = "qr-";

/** How long the scan waits for the API before forwarding home. */
export const QR_SCAN_TIMEOUT_MS = 4_000;

/** The longest browser name passed on (the API's limit). */
const USER_AGENT_MAX = 512;

/** Where a scan goes. */
export type QrScan =
    /** A page of the site: forward there, tagged. */
    | { kind: "path"; path: string }
    /** A retired code, or one whose target is gone: the home page. */
    | { kind: "home" }
    /** The site has no such code: its 404. */
    | { kind: "missing" }
    /** The API couldn't say: the home page, nothing counted. */
    | { kind: "failed" };

/** The code a path segment names, lower-cased; null when it can't be one. */
export function qrCodeOf(segment: string | undefined): string | null {
    const code = segment?.trim().toLowerCase() ?? "";
    return QR_CODE_SHAPE.test(code) ? code : null;
}

/**
 * A tag a booking or a checkout sent back, as this server passes it on:
 * `qr-<code>`, lower-cased, or null for anything else. The page reads it
 * from its own address in the browser (`@saroh/site-blocks` `qr-source.ts`)
 * and it arrives as a server action's argument, so it is checked here like
 * every other field. The API decides whether the code is this site's.
 */
export function qrSourceTag(value: unknown): string | null {
    if (typeof value !== "string" || !value.startsWith(QR_SOURCE_PREFIX)) {
        return null;
    }
    const code = qrCodeOf(value.slice(QR_SOURCE_PREFIX.length));
    return code ? `${QR_SOURCE_PREFIX}${code}` : null;
}

export interface QrScanRequest {
    /** The API's origin (`serverApiUrl()`). */
    apiUrl: string;
    siteId: string;
    code: string;
    /** The request's headers with the signed visitor relay added. */
    headers: Record<string, string>;
    /** The visitor's browser, so a link preview isn't counted. */
    userAgent: string | null;
    /** A HEAD request: forwarded, never counted. */
    head: boolean;
    fetch?: typeof fetch;
    timeoutMs?: number;
}

/**
 * Ask the API where `code` goes on `siteId`:
 *
 *   POST /public/sites/:siteId/qr/:code/scan
 *
 * Never throws. Anything but a well-formed answer is `failed`, except the
 * API's own 404, which is `missing`.
 */
export async function scanQrCode(request: QrScanRequest): Promise<QrScan> {
    const send = request.fetch ?? fetch;
    let res: Response;
    try {
        res = await send(
            `${request.apiUrl}/public/sites/${encodeURIComponent(request.siteId)}/qr/${encodeURIComponent(request.code)}/scan`,
            {
                method: "POST",
                cache: "no-store",
                headers: {
                    ...request.headers,
                    accept: "application/json",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    ...(request.userAgent
                        ? {
                              userAgent: request.userAgent.slice(
                                  0,
                                  USER_AGENT_MAX,
                              ),
                          }
                        : {}),
                    ...(request.head ? { head: true } : {}),
                }),
                signal: AbortSignal.timeout(
                    request.timeoutMs ?? QR_SCAN_TIMEOUT_MS,
                ),
            },
        );
    } catch {
        return { kind: "failed" };
    }
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "failed" };
    const body = (await res.json().catch(() => null)) as {
        kind?: unknown;
        path?: unknown;
    } | null;
    if (body?.kind === "home") return { kind: "home" };
    if (body?.kind === "path" && typeof body.path === "string") {
        return { kind: "path", path: body.path };
    }
    return { kind: "failed" };
}

/**
 * The absolute address a scan forwards to, on `origin`.
 *
 * A target keeps any query it has and gains the tag; the home page is
 * bare. A path that isn't a plain path on this site (`//host`, a full
 * address, a backslash) is treated as the home page, so an answer can
 * never send a visitor to another site.
 */
export function qrRedirectLocation(
    origin: string,
    scan: QrScan,
    code: string,
): string {
    const home = `${origin}/`;
    if (scan.kind !== "path") return home;
    const path = scan.path;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
        return home;
    }
    let target: URL;
    try {
        target = new URL(path, home);
    } catch {
        return home;
    }
    if (target.origin !== new URL(home).origin) return home;
    target.searchParams.set(QR_SOURCE_PARAM, `${QR_SOURCE_PREFIX}${code}`);
    target.hash = "";
    return target.toString();
}

/** The 302 a scan answers with: never kept, never indexed. */
export function qrRedirect(location: string): Response {
    return new Response(null, {
        status: 302,
        headers: {
            location,
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
            "referrer-policy": "no-referrer",
        },
    });
}
