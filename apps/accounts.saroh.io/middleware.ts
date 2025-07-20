// import { nextAuthInstance } from "@saroh/auth/auth";
// import { NextResponse } from "next/server";
// const { auth } = nextAuthInstance;
// export default auth(async function (req) {
//     // Your custom middleware logic goes here
//     const { nextUrl } = req;
//     const isLoggedIn = !!req.auth;
//     const protectedRoutes = ["/", "/apps"];
//     console.log(nextUrl.pathname);
//     const path = nextUrl.pathname;

//     const authRoutes = ["/login"];
//     const isProtectedRoute = protectedRoutes.includes(nextUrl.pathname);
//     const isAuthRoute = authRoutes.includes(nextUrl.pathname);
//     if (isAuthRoute) {
//         if (isLoggedIn) {
//             return NextResponse.redirect(new URL("/apps", nextUrl));
//         }
//         return;
//     }
//     if (isProtectedRoute) {
//         if (isLoggedIn) {
//             if (path === "/apps") {
//                 return;
//             }
//             return NextResponse.redirect(new URL("/apps", nextUrl));
//         }
//         if (!isLoggedIn) {
//             return NextResponse.redirect(new URL("/login", nextUrl));
//         }
//         return;
//     }

//     if (!isLoggedIn) {
//         return NextResponse.redirect(new URL("/login", nextUrl));
//     }
//     return;
// });
// export const config = {
//     matcher: [
//         /*
//          * Match all paths except for:
//          * 1. /api routes
//          * 2. /_next (Next.js internals)
//          * 3. /_static (inside /public)
//          * 4. all root files inside /public (e.g. /favicon.ico)
//          */
//         "/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)",
//     ],
// };
import { auth } from "@/lib/better-auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}

export const config = {
    runtime: "nodejs",
    matcher: ["/dashboard"], // Apply middleware to specific routes
};
