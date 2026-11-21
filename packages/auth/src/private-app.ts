// Edge-safe and dependency-free beyond Next itself, as `dev-access.ts` is.
import type { NextRequest } from "next/server";

type Middleware = (request: NextRequest) => Response | Promise<Response>;

/**
 * What every answer of a signed-in app carries: never indexed and never
 * followed by a search engine, plus the browser security headers each app's
 * next.config sends on its pages (HTTPS only, no framing by another site, no
 * type guessing).
 *
 * They are repeated here because next.config's `headers()` never reaches an
 * answer the middleware itself gives. On the Workers build the sign-in
 * redirect went out with none of them, not even HSTS (found live, 12 Oct
 * 2026). `pnpm run check:security-headers` keeps the two lists the same.
 */
export const PRIVATE_APP_HEADERS = {
    "X-Robots-Tag": "noindex, nofollow",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "SAMEORIGIN",
    // ENFORCED_CSP (@saroh/auth/security-headers), the floor; `withNonce`
    // replaces it with the full policy, which contains it.
    "Content-Security-Policy":
        "frame-ancestors 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'",
    "X-Content-Type-Options": "nosniff",
} as const;

/** The same answer with the headers on it; a frozen one is copied first. */
function stamped(response: Response): Response {
    let out = response;
    try {
        out.headers.set("X-Robots-Tag", PRIVATE_APP_HEADERS["X-Robots-Tag"]);
    } catch {
        // `Response.redirect()` and a fetched answer have read-only headers.
        out = new Response(response.body, response);
    }
    for (const [name, value] of Object.entries(PRIVATE_APP_HEADERS))
        out.headers.set(name, value);
    return out;
}

/**
 * Keeps a signed-in app (the workspace, accounts, the operator console) out
 * of search engines by design rather than by its sign-in redirect, and
 * enforces its Content-Security-Policy with a per-request nonce
 * (`withNonce`; `policyFor` is `contentSecurityPolicy` from
 * `@saroh/auth/security-headers`, given the app's sources).
 *
 * It goes OUTSIDE everything else in the app's `middleware.ts` or `proxy.ts`
 * (`withPrivateApp(withDevAccess(…))`), so every answer the middleware
 * gives has the headers: a page it lets through (Next copies them onto the
 * page's answer), a redirect to sign-in, a refused request, and the dev
 * environment's own redirects. A crawler that is redirected reads
 * `X-Robots-Tag` on the redirect itself, which a `<meta>` tag on the page
 * behind it can never give.
 *
 * What the middleware's matcher skips is covered elsewhere: next.config's
 * `headers()` for anything Next answers, and `public/_headers` for the files
 * Cloudflare serves without running the Worker.
 */
export function withPrivateApp(
    next: Middleware,
    policyFor: (nonce: string) => string,
): Middleware {
    return withNonce(async function privateApp(request) {
        return stamped(await next(request));
    }, policyFor);
}

/** Where Next reads a middleware's request-header overrides from. */
const OVERRIDES = "x-middleware-override-headers";

/**
 * Enforces `policyFor(nonce)` as the answer's Content-Security-Policy, with
 * a fresh nonce for every request (21 Nov 2026). A page it lets through or
 * rewrites also gets the policy and `x-nonce` on its REQUEST: Next reads the
 * nonce out of the request's CSP and stamps it on its own scripts, and a
 * layout reads `x-nonce` for the scripts it writes (the theme's).
 *
 * The request headers go the way `NextResponse.next({ request })` sends
 * them (`x-middleware-request-*`, listed in `x-middleware-override-headers`),
 * merged with any the inner middleware already overrode. Next and OpenNext
 * both read that convention.
 *
 * Only the middleware may send this header: on Workers a next.config header
 * of the same name replaces the middleware's (`check:security-headers`).
 */
export function withNonce(
    next: Middleware,
    policyFor: (nonce: string) => string,
): Middleware {
    return async function nonced(request) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        const nonce = btoa(
            Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
        );
        const policy = policyFor(nonce);
        let out = await next(request);
        try {
            out.headers.set("Content-Security-Policy", policy);
        } catch {
            out = new Response(out.body, out);
            out.headers.set("Content-Security-Policy", policy);
        }
        const headers = out.headers;
        if (
            !headers.has("x-middleware-next") &&
            !headers.has("x-middleware-rewrite")
        )
            return out;
        const listed = headers.get(OVERRIDES);
        const keys = new Set(listed === null ? [] : listed.split(","));
        // No override yet means "the request as it came": list all of it.
        if (listed === null)
            request.headers.forEach((value, key) => {
                headers.set(`x-middleware-request-${key}`, value);
                keys.add(key);
            });
        for (const [key, value] of [
            ["content-security-policy", policy],
            ["x-nonce", nonce],
        ] as const) {
            headers.set(`x-middleware-request-${key}`, value);
            keys.add(key);
        }
        headers.set(OVERRIDES, Array.from(keys).join(","));
        return out;
    };
}
