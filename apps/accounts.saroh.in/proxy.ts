import { getServerSession } from "@saroh/auth/next";
import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedRoutes = new Set(["/apps", "/"]);
const authRoutePrefixes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
];

export default async function proxy(req: NextRequest) {
    const { nextUrl } = req;
    // Cheap presence check (no network); full validation hits api below.
    const sessionCookie = getSessionCookie(req);

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

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    ],
};
