import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
    STAFF_INVITE_COOKIE,
    STAFF_INVITE_COOKIE_MAX_AGE_SECONDS,
    STAFF_INVITE_PATH,
    STAFF_INVITE_TOKEN_PATTERN,
} from "@/lib/staff-invite-words";

/**
 * Where a staff invite's email link lands (admin console U24): it swaps the
 * token in the address for a short-lived httpOnly cookie and sends the
 * browser on to a clean `/staff-invite`. From then on the address bar, the
 * history, a pasted address and any Referer carry no token, and no script
 * on the page can read it. The answer itself sends no referrer and is never
 * cached.
 *
 * Nothing is checked here: the page asks the API. A link with no token, or
 * one that isn't shaped like one, clears any earlier cookie, so the page
 * says to open the email again rather than show an older invite.
 */
export function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const clean = new URL(STAFF_INVITE_PATH, request.nextUrl.origin);
    const response = NextResponse.redirect(clean, 303);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");

    if (!STAFF_INVITE_TOKEN_PATTERN.test(token)) {
        response.cookies.delete({
            name: STAFF_INVITE_COOKIE,
            path: STAFF_INVITE_PATH,
        });
        return response;
    }
    response.cookies.set({
        name: STAFF_INVITE_COOKIE,
        value: token,
        httpOnly: true,
        // HTTPS everywhere but the browser-test stack's plain localhost.
        secure: request.nextUrl.protocol === "https:",
        // Lax, so the cookie still rides the top-level navigation back here
        // after signing in on this host.
        sameSite: "lax",
        path: STAFF_INVITE_PATH,
        maxAge: STAFF_INVITE_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
}
