import { sessionCookiePrefix } from "@saroh/auth/constants";
import { withDevAccess } from "@saroh/auth/dev-access";
import { getServerSession } from "@saroh/auth/next";
import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
    defaultDestination,
    SIGNED_OUT_PAGES,
    signedInDestination,
} from "@/lib/return-to";

const protectedRoutes = new Set(["/businesses", "/apps", "/account", "/"]);

async function proxy(req: NextRequest) {
    const { nextUrl } = req;
    // Cheap presence check (no network); full validation hits api below.
    const sessionCookie = getSessionCookie(req, {
        cookiePrefix: sessionCookiePrefix(),
    });

    const isLoggedIn = !!sessionCookie;
    const isOnProtectedRoute = protectedRoutes.has(nextUrl.pathname);
    const isOnAuthRoute = SIGNED_OUT_PAGES.some((p) =>
        nextUrl.pathname.startsWith(p),
    );

    // Someone already signed in has no use for the sign-in pages: send them
    // where their link was going, else to Saroh itself, whose front door
    // sorts out setup, Home or which business. Validate against api (auth
    // lives there now).
    if (isOnAuthRoute && sessionCookie) {
        const session = await getServerSession(req.headers);
        if (session?.user) {
            return NextResponse.redirect(
                new URL(
                    signedInDestination(nextUrl.searchParams.get("redirect")),
                    req.url,
                ),
            );
        }
    }

    if (isOnProtectedRoute && !isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // Accounts has no page at "/": signing in lands on Saroh, so the bare
    // address goes there too rather than to the 404.
    if (nextUrl.pathname === "/") {
        return NextResponse.redirect(new URL(defaultDestination()));
    }

    return NextResponse.next();
}

// The dev environment admits only browsers holding its key (withDevAccess).
export default withDevAccess(proxy);

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    ],
};
