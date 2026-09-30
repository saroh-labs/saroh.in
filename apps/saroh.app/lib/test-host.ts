import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { classifySiteHost } from "./site-host-mode";

/**
 * What the middleware does on a test host (DEC-071, T5; KTD-5).
 *
 * A test release is opened by a link: `https://test--<address>.saroh.app/
 * ?release=<token>`. The first request moves the token into a host-only
 * cookie and redirects to the same address without it, so the token leaves
 * the address bar and the history, and every page of the site (`/shop`,
 * `/book`, `/account`, any page) works unchanged on that host. Every later
 * request reads the cookie, and the middleware hands the token to the pages
 * in a request header only it can set.
 *
 * Edge-safe and dependency-free, so the middleware and a unit test share it.
 */

/**
 * The cookie the token lives in. `__Host-` pins it to exactly this host (no
 * Domain, Path=/, Secure), so it never reaches the live host or another
 * business, even though `saroh.app` is not on the Public Suffix List.
 */
export const TEST_RELEASE_COOKIE = "__Host-saroh-test";

/** The link's query parameter. */
export const TEST_RELEASE_PARAM = "release";

/**
 * The request header the middleware passes the token on in. Deleted from
 * every incoming request, on every host, before it is set from the cookie, so
 * a visitor can never supply it.
 */
export const TEST_RELEASE_HEADER = "x-saroh-test-release";

/**
 * The request header that tells the gate route it was reached by the
 * middleware (a test host with no link), not by someone typing its path.
 */
export const TEST_GATE_HEADER = "x-saroh-test-gate";

/** Where the middleware serves a test host that holds no link. */
export const TEST_GATE_PATH = "/test-release-gate";

/**
 * How long the cookie is kept. The link's own expiry is what decides whether
 * it opens anything, checked by the API on every request; this only saves a
 * reviewer from needing the link again tomorrow. The longest link lasts 30
 * days.
 */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** Headers every response on a test host carries (R3). */
export const TEST_HOST_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
};

/** A token as a link carries it: base64url, and a sane length. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

/** A token a visitor sent, if it is shaped like one. */
function tokenOf(value: string | null | undefined): string | null {
    const token = value?.trim();
    return token && TOKEN_SHAPE.test(token) ? token : null;
}

/** The origin the visitor's browser is on: its scheme, host and port. */
function visitorOrigin(req: NextRequest): string {
    const forwarded = req.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim()
        .toLowerCase();
    const scheme =
        forwarded === "https" || forwarded === "http"
            ? forwarded
            : req.nextUrl.protocol.replace(/:$/, "");
    // The Host the browser sent (an empty one counts as none).
    const host =
        [req.headers.get("host")?.trim(), req.nextUrl.host].find(Boolean) ??
        req.nextUrl.host;
    return `${scheme}://${host}`;
}

function withTestHeaders<T extends Response>(res: T): T {
    for (const [key, value] of Object.entries(TEST_HOST_RESPONSE_HEADERS)) {
        res.headers.set(key, value);
    }
    return res;
}

/**
 * Whether `hostname` is a test host under this renderer's root domain.
 */
export function isTestHost(hostname: string, rootDomain: string): boolean {
    return classifySiteHost(hostname, rootDomain).mode === "test";
}

/**
 * The incoming request's headers without the test-release headers a visitor
 * may have sent, or null when there were none to take out.
 */
export function withoutForgedTestHeaders(req: NextRequest): Headers | null {
    if (
        !req.headers.has(TEST_RELEASE_HEADER) &&
        !req.headers.has(TEST_GATE_HEADER)
    ) {
        return null;
    }
    const headers = new Headers(req.headers);
    headers.delete(TEST_RELEASE_HEADER);
    headers.delete(TEST_GATE_HEADER);
    return headers;
}

/**
 * The response for a request on a test host, given where a live host's
 * request would have been rewritten to (`/<host><path>`).
 *
 *  - `/pay/*` is a 404: pay links are about real invoices (plan, Out of
 *    scope).
 *  - `?release=<token>` sets the cookie and redirects to the same address
 *    without it.
 *  - No cookie: the gate, which says a link is needed.
 *  - Otherwise the site, with the token passed on in
 *    {@link TEST_RELEASE_HEADER}.
 *
 * Every answer carries `noindex` and `no-referrer`.
 */
export function testHostResponse(
    req: NextRequest,
    tenantTarget: URL,
    isPay: boolean,
): NextResponse {
    const url = req.nextUrl;

    if (isPay) {
        return withTestHeaders(
            new NextResponse("Not found", {
                status: 404,
                headers: { "content-type": "text/plain; charset=utf-8" },
            }),
        );
    }

    if (url.searchParams.has(TEST_RELEASE_PARAM)) {
        const token = tokenOf(url.searchParams.get(TEST_RELEASE_PARAM));
        const params = new URLSearchParams(url.search);
        params.delete(TEST_RELEASE_PARAM);
        const query = params.toString();
        // Absolute, because the edge runtime refuses a relative Location
        // ("Invalid URL"). Built from what the browser asked for: its Host
        // (port kept) and the scheme the proxy in front says it used, since
        // the server behind portless or Vercel's edge sees plain http.
        const location = `${visitorOrigin(req)}${url.pathname}${query ? `?${query}` : ""}`;
        const res = new NextResponse(null, {
            status: 303,
            headers: { location, "cache-control": "no-store" },
        });
        if (token) {
            res.cookies.set(TEST_RELEASE_COOKIE, token, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
                maxAge: COOKIE_MAX_AGE,
            });
        }
        return withTestHeaders(res);
    }

    const headers = new Headers(req.headers);
    headers.delete(TEST_RELEASE_HEADER);
    headers.delete(TEST_GATE_HEADER);

    const token = tokenOf(req.cookies.get(TEST_RELEASE_COOKIE)?.value);
    if (!token) {
        headers.set(TEST_GATE_HEADER, "1");
        const gate = new URL(TEST_GATE_PATH, url);
        return withTestHeaders(
            NextResponse.rewrite(gate, { request: { headers } }),
        );
    }

    headers.set(TEST_RELEASE_HEADER, token);
    return withTestHeaders(
        NextResponse.rewrite(tenantTarget, { request: { headers } }),
    );
}
