// POST /api/link-preview/report {email, url} — unlock the fix-it report
//
// Forwarded to api.saroh.in with the signed visitor relay, as the check is
// (`../route.ts`). Only the email and the address go: the tool asks for no
// consent, and anything else the page posts is dropped here.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type { UnlockResult } from "@/lib/link-preview";
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
    const email =
        typeof p.email === "string" ? p.email.trim().slice(0, 320) : "";
    const url =
        typeof p.url === "string" ? p.url.trim().slice(0, MAX_ADDRESS) : "";
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
    const headers = linkPreviewHeaders({
        headers: req.headers,
        host: new URL(req.url).host,
        secret: relaySecret(env.SITE_RELAY_SECRET, env.NODE_ENV),
    });
    if (!headers) {
        console.error(
            "[link-preview] SITE_RELAY_SECRET is not set; unlock dropped",
        );
        return fail("unavailable", 503);
    }

    try {
        const upstream = await fetch(
            `${env.API_URL}/public/tools/link-preview/report`,
            {
                method: "POST",
                headers,
                body: JSON.stringify({ email, url }),
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
