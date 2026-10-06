import { NextResponse } from "next/server";

import {
    PREVIEW_COOKIE,
    PREVIEW_COOKIE_PATH,
    PREVIEW_HEADERS,
    PREVIEW_MAX_AGE_SECONDS,
} from "@/lib/pricing-preview";

/**
 * `GET /pricing/preview?token=…` — the link the admin console's "Preview"
 * opens (plans catalogue U24, KTD-10). It swaps the token for an HttpOnly
 * cookie scoped to the draft page and redirects there, so the token leaves
 * the address bar, the history and any referrer at once. It never checks the
 * token itself: the API does, when the draft page forwards it.
 *
 * Never cached, never indexed, no referrer.
 */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    // A token is a short signed string; anything else is not worth keeping.
    const usable = token.length > 0 && token.length <= 2048;
    const res = NextResponse.redirect(
        new URL(usable ? PREVIEW_COOKIE_PATH : "/pricing", url),
        303,
    );
    for (const [k, v] of Object.entries(PREVIEW_HEADERS)) res.headers.set(k, v);
    if (usable) {
        res.cookies.set(PREVIEW_COOKIE, token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: PREVIEW_COOKIE_PATH,
            maxAge: PREVIEW_MAX_AGE_SECONDS,
        });
    }
    return res;
}
