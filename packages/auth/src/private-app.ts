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
    "Content-Security-Policy": "frame-ancestors 'self'",
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
 * of search engines by design rather than by its sign-in redirect.
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
export function withPrivateApp(next: Middleware): Middleware {
    return async function privateApp(request) {
        return stamped(await next(request));
    };
}
