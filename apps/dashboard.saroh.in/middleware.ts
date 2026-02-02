import { nextAuthInstance } from "@saroh/auth/auth";
import { NextResponse } from "next/server";
const { auth } = nextAuthInstance;

export default auth(async function (req) {
    // Your custom middleware logic goes here
    const isLoggedIn = !!req.auth;

    if (!isLoggedIn) {
        return NextResponse.redirect(
            new URL("/login", process.env.NEXT_PUBLIC_AUTH_APP_DOMAIN),
        );
    }
    return;
});
export const config = {
    matcher: [
        /*
         * Match all paths except for:
         * 1. /api routes
         * 2. /_next (Next.js internals)
         * 3. /_static (inside /public)
         * 4. all root files inside /public (e.g. /favicon.ico)
         */
        "/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)",
    ],
};
