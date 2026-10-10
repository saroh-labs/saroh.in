// POST /api/business-reports {site, message, email?} — /customers' report
//
// Forwarded to api.saroh.in's public `POST /public/business-reports`, as
// `/api/waitlist` forwards a join: the API origin stays out of the browser,
// there is no CORS preflight, and the visitor's address is signed into
// `x-saroh-relay` for the API's per-visitor limit (`lib/waitlist-forward.ts`).
// Only the three fields go on.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type { ReportResult } from "@/lib/business-report";
import { reportBody } from "@/lib/business-report";
import { forwardHeaders, relaySecret } from "@/lib/waitlist-forward";

export async function POST(req: Request) {
    const fail = (
        failure: Extract<ReportResult, { sent: false }>["failure"],
        status: number,
    ) => NextResponse.json<ReportResult>({ sent: false, failure }, { status });

    let posted: unknown;
    try {
        posted = await req.json();
    } catch {
        posted = null;
    }
    const body = reportBody(posted);
    if (!body) return fail("site", 400);

    if (!env.API_URL) {
        console.error(
            "[business-reports] API_URL is not configured; report dropped",
        );
        return fail("unavailable", 503);
    }

    try {
        const upstream = await fetch(`${env.API_URL}/public/business-reports`, {
            method: "POST",
            headers: forwardHeaders({
                headers: req.headers,
                host: new URL(req.url).host,
                secret: relaySecret(env.SITE_RELAY_SECRET, env.NODE_ENV),
            }),
            body: JSON.stringify(body),
        });
        if (upstream.status === 429) return fail("rate-limited", 429);
        // The page checks each field first; what the API still refuses is
        // the address, which it reads more strictly.
        if (upstream.status === 400) return fail("site", 400);
        if (!upstream.ok) {
            console.error(`[business-reports] upstream ${upstream.status}`);
            return fail("unavailable", 502);
        }
        return NextResponse.json<ReportResult>({ sent: true });
    } catch (reason) {
        console.error("[business-reports] forward failed:", String(reason));
        return fail("unavailable", 502);
    }
}
