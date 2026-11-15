import { NextResponse } from "next/server";

import { apiStream, orgBase } from "@/lib/api/http";
import { UNREACHED } from "@/lib/api/unreached";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";

/**
 * Ask AI's question (plan 2026-11-13-001 U9): the API's server-sent
 * events, passed through as they arrive. A proxy, so the session and the
 * business open stay server-side: the business is the active one, never
 * one the browser names. Only the three headers below go back; nothing
 * of the API's, never a cookie. Off with `NEXT_PUBLIC_ASK_AI` (a 404).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
    if (!askAiOn()) {
        return NextResponse.json(
            { error: "Not found" },
            { status: 404, headers: NO_STORE },
        );
    }
    const base = await orgBase();
    if (!base) {
        return NextResponse.json(
            { error: "No business is open. Choose one and try again." },
            { status: 404, headers: NO_STORE },
        );
    }
    let upstream: Response;
    try {
        upstream = await apiStream(`${base}/ask-ai/turns`, {
            method: "POST",
            body: await request.text(),
            // The browser left: let go of the API. It finishes the turn anyway.
            signal: request.signal,
        });
    } catch {
        return NextResponse.json(
            { error: UNREACHED },
            { status: 503, headers: NO_STORE },
        );
    }
    if (!upstream.ok || !upstream.body) {
        const body: unknown = await upstream.json().catch(() => null);
        return NextResponse.json(body ?? { error: UNREACHED }, {
            status: upstream.ok ? 502 : upstream.status,
            headers: NO_STORE,
        });
    }
    return new Response(upstream.body, {
        headers: {
            "content-type": "text/event-stream",
            ...NO_STORE,
            "x-accel-buffering": "no",
        },
    });
}
