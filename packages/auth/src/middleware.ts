import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

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
export function createAuthMiddleware(opts: AuthMiddlewareOptions) {
    return function middleware(request: NextRequest): NextResponse {
        if (MUTATING_METHODS.has(request.method)) {
            const origin =
                request.headers.get("origin") ??
                request.headers.get("referer");
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
            loginUrl.searchParams.set("redirect", request.nextUrl.href);
            return NextResponse.redirect(loginUrl);
        }

        return NextResponse.next();
    };
}
