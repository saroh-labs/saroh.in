import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/env";

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

/** This app's own dev port, so `foo.localhost:3009` resolves like a subdomain. */
const DEV_HOST = "localhost:3009";

/** Hosts that are the renderer itself rather than a tenant site. */
function isApexHost(hostname: string): boolean {
    return (
        hostname === DEV_HOST ||
        hostname === env.NEXT_PUBLIC_ROOT_DOMAIN ||
        hostname === `www.${env.NEXT_PUBLIC_ROOT_DOMAIN}` ||
        hostname === "saroh.in" ||
        hostname === "www.saroh.in"
    );
}

export default function middleware(req: NextRequest) {
    const url = req.nextUrl;

    // e.g. demo.saroh.in, or demo.localhost:3009 in development
    const hostname = (req.headers.get("host") ?? "").replace(
        `.${DEV_HOST}`,
        `.${env.NEXT_PUBLIC_ROOT_DOMAIN}`,
    );
    const path = url.pathname;

    // The legacy scaffold domain still has DNS pointed here.
    if (hostname === "saroh.site" || hostname === "www.saroh.site") {
        return NextResponse.redirect("https://saroh.in");
    }

    // The apex is the renderer's own root page. This previously rewrote to
    // `/home${path}` — a route that does not exist in this app — so every apex
    // request 404'd instead of reaching app/page.tsx.
    if (isApexHost(hostname)) {
        return NextResponse.next();
    }

    // Everything else is a tenant hostname: rewrite to the /[domain] route.
    return NextResponse.rewrite(new URL(`/${hostname}${path}`, req.url));
}
