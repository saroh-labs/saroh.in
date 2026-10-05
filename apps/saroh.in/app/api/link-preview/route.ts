// GET /api/link-preview?url=…[&fresh=1]  — check an address
// POST /api/link-preview {email, url, consent} — unlock the fix-it report
//
// The link preview tool (resources plan U2, KTD-3) asks api.saroh.in, the
// only server that fetches a stranger's address, from here — server to
// server, with the visitor's address signed into `x-saroh-relay` exactly as
// /api/waitlist does (`lib/waitlist-forward.ts`), so the API's limits count
// each visitor rather than this server. The API's origin stays out of the
// browser, and every answer the page reads is shaped here: a failure is a
// typed state, never a thrown error.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type { CheckResult, UnlockResult } from "@/lib/link-preview";
import { forwardHeaders, relaySecret } from "@/lib/waitlist-forward";

const MAX_ADDRESS = 4096;

function headersFor(req: Request): Record<string, string> {
    return forwardHeaders({
        headers: req.headers,
        host: new URL(req.url).host,
        secret: relaySecret(env.SITE_RELAY_SECRET, env.NODE_ENV),
    });
}

export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;
    const url = params.get("url")?.trim().slice(0, MAX_ADDRESS) ?? "";
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

    const query = new URLSearchParams({ url });
    if (params.get("fresh") === "1") query.set("fresh", "1");
    try {
        const upstream = await fetch(
            `${env.API_URL}/public/tools/link-preview?${query.toString()}`,
            { headers: headersFor(req), cache: "no-store" },
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
    const email =
        typeof p.email === "string" ? p.email.trim().slice(0, 320) : "";
    const url =
        typeof p.url === "string" ? p.url.trim().slice(0, MAX_ADDRESS) : "";
    const consent = p.consent === true;
    const fail = (
        failure: "bad-email" | "invalid" | "rate-limited" | "unavailable",
        status: number,
    ) =>
        NextResponse.json<UnlockResult>(
            { unlocked: false, failure },
            { status },
        );

    if (!email) return fail("bad-email", 400);
    if (!url) return fail("invalid", 400);
    if (!env.API_URL) {
        console.error(
            "[link-preview] API_URL is not configured; unlock dropped",
        );
        return fail("unavailable", 503);
    }

    try {
        const upstream = await fetch(
            `${env.API_URL}/public/tools/link-preview/report`,
            {
                method: "POST",
                headers: headersFor(req),
                body: JSON.stringify({ email, url, consent }),
            },
        );
        if (upstream.status === 429) return fail("rate-limited", 429);
        // The API refuses only the email here; the address is a typed state.
        if (upstream.status === 400) return fail("bad-email", 400);
        if (!upstream.ok) {
            console.error(`[link-preview] unlock upstream ${upstream.status}`);
            return fail("unavailable", 502);
        }
        return NextResponse.json<UnlockResult>(
            (await upstream.json()) as UnlockResult,
        );
    } catch (reason) {
        console.error("[link-preview] unlock forward failed:", String(reason));
        return fail("unavailable", 502);
    }
}
