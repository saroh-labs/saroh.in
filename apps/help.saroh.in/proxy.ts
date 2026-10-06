import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "./env";
import { DEFAULT_MARKETING_URL, movedTo } from "./lib/moved-to-saroh-in";

/**
 * From midnight in India on 17 Oct 2026 every request here is sent, with a
 * permanent redirect (308), to its page on saroh.in/help
 * (`lib/moved-to-saroh-in.ts`). Decided per request, not in `next.config`,
 * whose redirects are fixed at build: the move happens on the day with no
 * deploy. Before then, every request passes through as before.
 */
export default function proxy(request: NextRequest) {
    const to = movedTo(
        request.nextUrl.pathname,
        new Date(),
        env.MARKETING_URL ?? DEFAULT_MARKETING_URL,
    );
    return to ? NextResponse.redirect(to, 308) : NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image).*)"],
};
