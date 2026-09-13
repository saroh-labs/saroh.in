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

/**
 * Hosts that are the renderer itself rather than a tenant site.
 *
 * The literal fallback is `saroh.app`, which is this service's own apex. It
 * used to be `saroh.in` — correct while merchant subdomains hung off the same
 * host as the marketing site, and wrong the moment tenants moved to
 * `*.saroh.app`. Left in place it would have claimed the marketing apex as this
 * app's own: a request for `saroh.in` arriving here would render "Nothing is
 * published at this address" instead of being treated as a tenant lookup that
 * finds nothing, which is a different and more confusing failure.
 */
function isApexHost(hostname: string): boolean {
    return (
        hostname === env.NEXT_PUBLIC_ROOT_DOMAIN ||
        hostname === `www.${env.NEXT_PUBLIC_ROOT_DOMAIN}` ||
        hostname === "saroh.app" ||
        hostname === "www.saroh.app"
    );
}

export default function middleware(req: NextRequest) {
    const url = req.nextUrl;

    /*
     * e.g. demo.saroh.app — or demo.saroh.app.localhost in development, where
     * NEXT_PUBLIC_ROOT_DOMAIN is `saroh.app.localhost` and every app runs at
     * its production hostname with `.localhost` appended (the `portless` field
     * in each app's package.json).
     *
     * The PORT is dropped. `Host` carries one whenever the server is not on 80
     * or 443, so a renderer reached at `localhost:3005` — a CI runner, a
     * container, anyone running this app without the proxy — never matched its
     * own apex and rewrote every request, `/preview/<token>` included, to a
     * tenant lookup for a host called "localhost:3005". It looked correct in
     * development only because portless answers on 443, where there is no port
     * to carry. A port never distinguishes one tenant from another.
     */
    const hostname = (req.headers.get("host") ?? "")
        .split(":")[0]
        .toLowerCase();
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
