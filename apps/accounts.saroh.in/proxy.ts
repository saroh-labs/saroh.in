import { sessionCookiePrefix } from "@saroh/auth/constants";
import { withDevAccess } from "@saroh/auth/dev-access";
import { getServerSession } from "@saroh/auth/next";
import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedRoutes = new Set(["/businesses", "/apps", "/account", "/"]);
const authRoutePrefixes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
];

async function proxy(req: NextRequest) {
    const { nextUrl } = req;
    // Cheap presence check (no network); full validation hits api below.
    const sessionCookie = getSessionCookie(req, {
        cookiePrefix: sessionCookiePrefix(),
    });

    const isLoggedIn = !!sessionCookie;
    const isOnProtectedRoute = protectedRoutes.has(nextUrl.pathname);
    const isOnAuthRoute = authRoutePrefixes.some((p) =>
        nextUrl.pathname.startsWith(p),
    );

    // Already authenticated visitors shouldn't see the auth screens — bounce
    // them to the app picker. Validate against api (auth lives there now).
    if (isOnAuthRoute && sessionCookie) {
        const session = await getServerSession(req.headers);
        if (session?.user) {
            return NextResponse.redirect(new URL("/apps", req.url));
        }
    }

    if (isOnProtectedRoute && !isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // Accounts has no page at "/": sign-in lands on /apps, so the bare
    // address goes there too rather than to the 404.
    if (nextUrl.pathname === "/") {
        return NextResponse.redirect(new URL("/apps", req.url));
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
