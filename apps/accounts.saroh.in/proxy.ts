import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

const protectedRoutes = new Set(["/apps", "/"]);
const authRoutePrefixes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
];

async function getSession(req: NextRequest) {
    const cookie = req.headers.get("cookie") ?? "";
    if (!cookie) return null;

    const sessionUrl = new URL("/api/auth/get-session", req.url);
    const response = await fetch(sessionUrl, {
        method: "GET",
        headers: { cookie },
        cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as { user?: unknown } | null;
}

export default async function proxy(req: NextRequest) {
    const { nextUrl } = req;
    const sessionCookie = getSessionCookie(req);

    const res = NextResponse.next();

    const isLoggedIn = !!sessionCookie;
    const isOnProtectedRoute = protectedRoutes.has(nextUrl.pathname);
    const isOnAuthRoute = authRoutePrefixes.some((p) =>
        nextUrl.pathname.startsWith(p),
    );

    if (isOnAuthRoute && sessionCookie) {
        const session = await getSession(req);
        if (session?.user) {
            return NextResponse.redirect(new URL("/apps", req.url));
        }
    }

    if (isOnProtectedRoute && !isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    return res;
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    ],
};
