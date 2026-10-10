// POST /api/qr-code-maker/unlock {email} — unlock the QR code maker's downloads
//
// Forwarded to api.saroh.in with the signed visitor relay, as the link
// preview tool's routes are (`lib/link-preview-forward.ts`): the API refuses
// the call without it. Only the email goes. The page sends nothing else, and
// anything else a caller posts — a link, a logo, a label — is dropped here,
// so nothing about a visitor's code can reach Saroh through this route.

import { NextResponse } from "next/server";

import { env } from "@/env";
import { linkPreviewHeaders } from "@/lib/link-preview-forward";
import type { QrUnlockResult } from "@/lib/qr-code-maker";
import { relaySecret } from "@/lib/waitlist-forward";

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
    const fail = (
        failure: "bad-email" | "rate-limited" | "unavailable",
        status: number,
    ) =>
        NextResponse.json<QrUnlockResult>(
            { unlocked: false, failure },
            { status },
        );

    if (!email) return fail("bad-email", 400);
    if (!env.API_URL) {
        console.error(
            "[qr-code-maker] API_URL is not configured; unlock dropped",
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
            "[qr-code-maker] SITE_RELAY_SECRET is not set; unlock dropped",
        );
        return fail("unavailable", 503);
    }

    try {
        const upstream = await fetch(
            `${env.API_URL}/public/tools/qr-code-maker/unlock`,
            { method: "POST", headers, body: JSON.stringify({ email }) },
        );
        if (upstream.status === 429) return fail("rate-limited", 429);
        // The only thing the API validates here is the email.
        if (upstream.status === 400) return fail("bad-email", 400);
        if (!upstream.ok) {
            console.error(`[qr-code-maker] unlock upstream ${upstream.status}`);
            return fail("unavailable", 502);
        }
        const body = (await upstream.json()) as Partial<
            Extract<QrUnlockResult, { unlocked: true }>
        >;
        const emailed =
            body.emailed === "sent" || body.emailed === "limited"
                ? body.emailed
                : "not-sent";
        return NextResponse.json<QrUnlockResult>({ unlocked: true, emailed });
    } catch (reason) {
        console.error("[qr-code-maker] unlock forward failed:", String(reason));
        return fail("unavailable", 502);
    }
}
