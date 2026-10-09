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
 * (`lib/private-paths.ts`), previews and review links, the renderer's own
 * routes, and Next's internals (which the static assets serve anyway).
 */
const NEVER_PREFIXES = [
    "/preview",
    "/review",
    "/pay",
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
 * The key a page is kept under: its host (so one site never answers for
 * another), its path and query, the build that drew it (a new deploy's
 * pages name new script files, so an old page is never served after one),
 * and a digest of the headers Next varies on.
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
    key.search = url.search;
    key.searchParams.set("__page_cache", `${version}.${await sha256(vary)}`);
    return key.toString();
}
