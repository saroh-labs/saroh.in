// POST /api/link-preview {url, fresh?} — check an address
//
// The link preview tool (resources plan U2, KTD-3) asks api.saroh.in, the
// only server that fetches a stranger's address, from here — server to
// server, always with the visitor's address signed into `x-saroh-relay`
// (`lib/link-preview-forward.ts`): the API refuses the call without it.
// The address travels in the body both ways, never a query string, which
// request logs keep. The API's origin stays out of the browser, and every
// answer the page reads is shaped here: a failure is a typed state, never
// a thrown error. The unlock is `report/route.ts`.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type { CheckResult } from "@/lib/link-preview";
import { linkPreviewHeaders } from "@/lib/link-preview-forward";
import { relaySecret } from "@/lib/waitlist-forward";

const MAX_ADDRESS = 4096;

export async function POST(req: Request) {
    let posted: unknown;
    try {
        posted = await req.json();
    } catch {
        posted = null;
    }
    const p = (
        typeof posted === "object" && posted !== null ? posted : {}
    ) as Record<string, unknown>;
    const url =
        typeof p.url === "string" ? p.url.trim().slice(0, MAX_ADDRESS) : "";
    const fresh = p.fresh === true;
    const fail = (
        failure: "invalid" | "rate-limited" | "unavailable",
        status = 200,
    ) =>
        NextResponse.json<CheckResult>({ ok: false, url, failure }, { status });

    if (!url) return fail("invalid", 400);
    if (!env.API_URL) {
        console.error("[link-preview] API_URL is not configured");
        return fail("unavailable", 503);
    }
    const headers = linkPreviewHeaders({
        headers: req.headers,
        host: new URL(req.url).host,
        secret: relaySecret(env.SITE_RELAY_SECRET, env.NODE_ENV),
    });
    if (!headers) {
        console.error(
            "[link-preview] SITE_RELAY_SECRET is not set; the API refuses unsigned checks",
        );
        return fail("unavailable", 503);
    }

    try {
        const upstream = await fetch(
            `${env.API_URL}/public/tools/link-preview`,
            {
                method: "POST",
                headers,
                body: JSON.stringify({ url, ...(fresh && { fresh }) }),
                cache: "no-store",
            },
        );
        if (upstream.status === 429) return fail("rate-limited", 429);
        if (upstream.status === 400) return fail("invalid", 400);
        if (!upstream.ok) {
            console.error(`[link-preview] upstream ${upstream.status}`);
            return fail("unavailable", 502);
        }
        return NextResponse.json<CheckResult>(
            (await upstream.json()) as CheckResult,
        );
    } catch (reason) {
        console.error("[link-preview] forward failed:", String(reason));
        return fail("unavailable", 502);
    }
}
