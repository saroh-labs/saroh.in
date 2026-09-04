import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isTrustedOrigin } from "./origins";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthMiddlewareOptions {
    /** Where to send unauthenticated users (e.g. the accounts login URL). */
    loginUrl: string;
    /**
     * Decide whether a path requires a session. Defaults to "all paths".
     * Return false for public paths the app wants to leave open.
     */
    isProtected?: (pathname: string) => boolean;
}

/**
 * Edge-safe Next.js middleware for apps that consume the accounts session.
 *
 * It does NOT hit the database — it checks for the signed session cookie's
 * presence (a cheap gate) and redirects unauthenticated users to accounts
 * with a `redirect` back-link. Full session validation happens server-side
 * via `getServerSession` (`@saroh/auth/next`) in RSC/route handlers.
 *
 * Because auth is now cookie-based, it also rejects cross-site mutating
 * requests whose Origin/Referer is not a trusted *.saroh.in origin (CSRF).
 */
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
function publicUrl(request: NextRequest): string {
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

export function createAuthMiddleware(opts: AuthMiddlewareOptions) {
    return function middleware(request: NextRequest): NextResponse {
        if (MUTATING_METHODS.has(request.method)) {
            const origin =
                request.headers.get("origin") ?? request.headers.get("referer");
            if (origin && !isTrustedOrigin(origin)) {
                return new NextResponse("Untrusted request origin", {
                    status: 403,
                });
            }
        }

        const isProtected = opts.isProtected
            ? opts.isProtected(request.nextUrl.pathname)
            : true;
        if (!isProtected) return NextResponse.next();

        const sessionCookie = getSessionCookie(request);
        if (!sessionCookie) {
            const loginUrl = new URL(opts.loginUrl);
            loginUrl.searchParams.set("redirect", publicUrl(request));
            return NextResponse.redirect(loginUrl);
        }

        return NextResponse.next();
    };
}
