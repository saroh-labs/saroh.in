// Edge-safe and dependency-free beyond Next itself, so a site with no sign-in
// (the marketing site) can use it without pulling in Better Auth.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * The URL the visitor typed, as seen from outside any proxy.
 *
 * `request.nextUrl` is NOT that. Next builds it from the address the server
 * is bound to — `localhost:<port>` — whenever it knows its own hostname and
 * port, which it always does in development. Behind a proxy (portless
 * locally, the platform edge in production) that address is one nobody can
 * reach, so a return-to link built from it sends the visitor to
 * `https://localhost:4040/` after they sign in. The forwarded headers carry
 * the public host and scheme; Next fills `x-forwarded-host` from `Host`
 * itself when no proxy set it, so the header is present in both cases.
 */
export function publicUrl(request: NextRequest): string {
    const first = (value: string | null) => value?.split(",")[0]?.trim();
    const proto =
        first(request.headers.get("x-forwarded-proto")) ??
        request.nextUrl.protocol.replace(/:$/, "");
    const host =
        first(request.headers.get("x-forwarded-host")) ??
        request.headers.get("host") ??
        request.nextUrl.host;
    return `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/** The cookie that says this browser has been let into the dev environment. */
export const DEV_ACCESS_COOKIE = "saroh-dev-access";
const DEV_ACCESS_PARAM = "access";
const DEV_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

type Middleware = (request: NextRequest) => Response | Promise<Response>;

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

/** Compares two hex digests without stopping at the first difference. */
function sameDigest(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function noIndex(response: Response): Response {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
}

/**
 * Keeps the dev environment to people who have its key.
 *
 * Off unless `DEV_ACCESS_KEY` is set, which the dev environment's
 * deployments have, and production's accounts.saroh.in until early access
 * opens (`PRELAUNCH_GATE` in its wrangler.jsonc); local development never
 * runs it.
 * `?access=<key>` on any page sets a cookie (on `DEV_ACCESS_COOKIE_DOMAIN`, so
 * one visit opens every dev app) and reloads the page without the key. A
 * visitor without the cookie is sent to the same page on production
 * (`DEV_REDIRECT_ORIGIN`), or to `DEV_REDIRECT_PATH` there when the page
 * has no twin (accounts' `/login` on the marketing site); a form post is
 * refused instead, so it is never replayed there. The cookie holds the key's digest, so changing the key
 * shuts out every browser let in with the old one.
 */
export function withDevAccess(next: Middleware): Middleware {
    return async function devAccess(request) {
        const key = process.env.DEV_ACCESS_KEY?.trim();
        if (!key) return next(request);

        const expected = await sha256Hex(key);
        const url = new URL(publicUrl(request));
        const given = url.searchParams.get(DEV_ACCESS_PARAM);
        url.searchParams.delete(DEV_ACCESS_PARAM);

        if (given !== null && sameDigest(await sha256Hex(given), expected)) {
            const response = NextResponse.redirect(url, 303);
            const domain = process.env.DEV_ACCESS_COOKIE_DOMAIN?.trim();
            response.cookies.set(DEV_ACCESS_COOKIE, expected, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
                maxAge: DEV_ACCESS_MAX_AGE,
                ...(domain ? { domain } : {}),
            });
            return noIndex(response);
        }

        const cookie = request.cookies.get(DEV_ACCESS_COOKIE)?.value;
        if (cookie && sameDigest(cookie, expected)) {
            return noIndex(await next(request));
        }

        const production = process.env.DEV_REDIRECT_ORIGIN?.trim();
        const isRead = request.method === "GET" || request.method === "HEAD";
        if (!isRead || !production) {
            return noIndex(new NextResponse("Not found", { status: 404 }));
        }
        const fixed = process.env.DEV_REDIRECT_PATH?.trim();
        return noIndex(
            NextResponse.redirect(
                new URL(fixed || `${url.pathname}${url.search}`, production),
                307,
            ),
        );
    };
}
