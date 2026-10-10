import { isPrivateSitePath } from "../private-paths";
import { classifySiteHost, normaliseSiteHost } from "../site-host-mode";

/**
 * Which requests the page cache may answer or keep (#863), and the key it
 * keeps them under. Pure, so the rules are tested without a Worker.
 *
 * Only a visitor who is nobody in particular gets a kept page: a GET to a
 * live merchant host, on a public path, with no customer session and no
 * test-release cookie. Everything else renders per request, as before.
 */

/** The customer's session (`lib/customer-session.ts`). */
const SESSION_COOKIE = "__Host-saroh_session";
/** A test release's token (`lib/test-host.ts`). */
const TEST_RELEASE_COOKIE = "__Host-saroh-test";

/**
 * Paths never kept on any host: the customer's own pages
 * (`lib/private-paths.ts`), previews and review links, a QR code's short
 * link (every scan must reach the server to be counted), the renderer's own
 * routes, and Next's internals (which the static assets serve anyway).
 */
const NEVER_PREFIXES = [
    "/preview",
    "/review",
    "/pay",
    "/q",
    "/api",
    "/_next",
    "/__saroh",
    "/template-renders",
    "/test-release-gate",
    "/cdn-cgi",
] as const;

/** Files at the root (`/favicon.ico`, `/robots.txt`, `/sitemap.xml`). */
const FILE_PATH = /\/[^/]*\.[A-Za-z0-9]+$/;

/**
 * The request headers a page's answer depends on besides its address: what
 * Next varies an RSC answer on (`app-router-headers.js`). Each goes into the
 * key, so a client navigation never gets a full page and the reverse.
 */
export const VARY_HEADERS = [
    "rsc",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-url",
] as const;

export type RequestDecision =
    { cacheable: true; host: string } | { cacheable: false; reason: string };

function cookieNames(header: string | null): Set<string> {
    const names = new Set<string>();
    if (!header) return names;
    for (const part of header.split(";")) {
        const name = part.split("=")[0]?.trim();
        if (name) names.add(name);
    }
    return names;
}

function hasPrefix(path: string, prefixes: readonly string[]): boolean {
    return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** The renderer's own apex: its root page, previews and review links. */
function isApex(host: string, rootDomain: string): boolean {
    return (
        host === rootDomain ||
        host === `www.${rootDomain}` ||
        host === "saroh.app" ||
        host === "www.saroh.app" ||
        host === "saroh.site" ||
        host === "www.saroh.site"
    );
}

export function decideRequest(
    request: Request,
    rootDomain: string,
): RequestDecision {
    if (request.method !== "GET") return { cacheable: false, reason: "method" };
    const url = new URL(request.url);
    const host = normaliseSiteHost(request.headers.get("host") ?? url.hostname);
    if (!host) return { cacheable: false, reason: "host" };
    if (isApex(host, rootDomain)) return { cacheable: false, reason: "apex" };
    if (classifySiteHost(host, rootDomain).mode === "test") {
        return { cacheable: false, reason: "test host" };
    }
    const path = url.pathname;
    if (isPrivateSitePath(path) || hasPrefix(path, NEVER_PREFIXES)) {
        return { cacheable: false, reason: "private path" };
    }
    if (FILE_PATH.test(path)) return { cacheable: false, reason: "file" };
    // A server action is a POST, and never gets here; one sent as a GET
    // would carry this header.
    if (request.headers.has("next-action")) {
        return { cacheable: false, reason: "action" };
    }
    const cookies = cookieNames(request.headers.get("cookie"));
    if (cookies.has(SESSION_COOKIE)) {
        return { cacheable: false, reason: "signed in" };
    }
    if (cookies.has(TEST_RELEASE_COOKIE)) {
        return { cacheable: false, reason: "test release" };
    }
    if (request.headers.has("authorization")) {
        return { cacheable: false, reason: "authorization" };
    }
    return { cacheable: true, host };
}

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

/**
 * Query parameters that say where a visit came from and change nothing
 * the server draws: an ad's or a share's tags, and the tag a QR code's
 * scan adds (`?src=qr-…`, read from the address by the page's own script,
 * `qr-source.ts`). Left in the key, every ad click, shared link and scan
 * was a page of its own and never met a kept one.
 */
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
    "fbclid",
    "gclid",
    "igshid",
    "src",
]);

/** Whether a query parameter is only about where the visit came from. */
export function isTrackingParam(name: string): boolean {
    const key = name.toLowerCase();
    return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

/**
 * A request's query as the key reads it: without the tracking parameters,
 * everything else as it came and in the order it came.
 */
export function keyedSearch(search: string): string {
    const kept = new URLSearchParams();
    new URLSearchParams(search).forEach((value, name) => {
        if (!isTrackingParam(name)) kept.append(name, value);
    });
    const query = kept.toString();
    return query ? `?${query}` : "";
}

/**
 * The key a page is kept under: its host (so one site never answers for
 * another), its path and query (less the tracking parameters,
 * {@link keyedSearch}), the build that drew it (a new deploy's pages name
 * new script files, so an old page is never served after one), and a
 * digest of the headers Next varies on.
 */
export async function pageCacheKey(
    request: Request,
    host: string,
    version: string,
): Promise<string> {
    const url = new URL(request.url);
    const vary = VARY_HEADERS.map(
        (name) => `${name}=${request.headers.get(name) ?? ""}`,
    ).join("\n");
    const key = new URL(`https://${host}/`);
    key.pathname = url.pathname;
    key.search = keyedSearch(url.search);
    key.searchParams.set("__page_cache", `${version}.${await sha256(vary)}`);
    return key.toString();
}

/**
 * The request the page is drawn from when it may be kept: the same one,
 * with the tracking parameters off its address. A kept page answers every
 * visitor to that page, so it is drawn for the address they share: nothing
 * of one visitor's ad click or scan is in what the next one is sent. The
 * visitor's own address is untouched (the browser keeps it, and the page's
 * script reads the QR tag from there). Unchanged when there is nothing to
 * take off.
 */
export function drawnRequest(request: Request): Request {
    const url = new URL(request.url);
    const search = keyedSearch(url.search);
    if (search === url.search) return request;
    url.search = search;
    return new Request(url.toString(), request);
}
