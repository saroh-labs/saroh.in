import { NextResponse } from "next/server";

import { searchWorkspace } from "@/lib/search/service";

/**
 * The command palette's only data source.
 *
 * A route handler rather than a server action, and a proxy rather than a direct
 * call to api.saroh.in, for two reasons that both matter:
 *
 * 1. The palette is a client component and search runs on every keystroke, so it
 *    needs a plain `fetch` target. Every other data path in this app is
 *    server-only (`lib/api/http` imports `next/headers`), and that boundary is
 *    what keeps the browser from ever holding an API base URL or a session
 *    header. This preserves it: the browser calls its own origin, and the
 *    session cookie is attached server-side as usual.
 * 2. The active organization is resolved here from the cookie, so the client
 *    cannot ask for another tenant's results by editing a request.
 *
 * `no-store` because a search result that is one keystroke stale is a wrong
 * answer, and because caching a per-tenant read at the edge is how tenants leak.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const result = await searchWorkspace(q);
    return NextResponse.json(result, {
        headers: { "cache-control": "no-store" },
    });
}
