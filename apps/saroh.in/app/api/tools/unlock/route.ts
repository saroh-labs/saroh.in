// POST /api/tools/unlock {email, tool?} — unlock a free tool's downloads
// (`/api/qr-code-maker/unlock` is the same route, its old path)
//
// `tool` is the tool's slug; none is the QR code maker. The API names the
// tool in its email from its own list, never from what is sent here.
// Forwarded to api.saroh.in with the signed visitor relay, as the link
// preview tool's routes are (`lib/link-preview-forward.ts`): the API refuses
// the call without it. Only the email and the slug go. The page sends nothing else, and
// anything else a caller posts — a link, a logo, a label — is dropped here,
// so nothing about a visitor's code can reach Saroh through this route.

import { NextResponse } from "next/server";

import { env } from "@/env";
import { linkPreviewHeaders } from "@/lib/link-preview-forward";
import type { QrUnlockResult } from "@/lib/qr-code-maker";
import { postedText, readPosted, relaySecret } from "@/lib/relay";

const TOOL_SLUG = /^[a-z0-9-]{1,60}$/;

export async function POST(req: Request) {
    const p = await readPosted(req);
    const email = postedText(p, "email", 320);
    const tool = typeof p.tool === "string" ? p.tool : undefined;
    const fail = (
        failure: "bad-email" | "rate-limited" | "unavailable",
        status: number,
    ) =>
        NextResponse.json<QrUnlockResult>(
            { unlocked: false, failure },
            { status },
        );

    if (!email) return fail("bad-email", 400);
    // Our pages send their own slug; anything else is not one of them.
    if (tool !== undefined && !TOOL_SLUG.test(tool)) {
        return fail("unavailable", 400);
    }
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
            { method: "POST", headers, body: JSON.stringify({ email, tool }) },
        );
        if (upstream.status === 429) return fail("rate-limited", 429);
        // The slug is checked above and is our pages' own, so a 400 is the email.
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
