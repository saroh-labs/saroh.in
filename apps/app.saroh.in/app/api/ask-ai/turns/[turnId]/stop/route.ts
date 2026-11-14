import { NextResponse } from "next/server";

import { apiFetch, orgBase } from "@/lib/api/http";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";

/**
 * Stop on an Ask AI answer (plan 2026-11-13-001 U9): the asker's own turn
 * in the business open; the API answers 404 for anyone else's. A route
 * handler beside the question's, so the panel calls both the same way.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ turnId: string }> },
) {
    const base = askAiOn() ? await orgBase() : null;
    if (!base) {
        return NextResponse.json(
            { error: "Not found" },
            { status: 404, headers: NO_STORE },
        );
    }
    const { turnId } = await params;
    const res = await apiFetch(
        `${base}/ask-ai/turns/${encodeURIComponent(turnId)}/stop`,
        { method: "POST" },
    );
    const body: unknown = await res.json().catch(() => null);
    return NextResponse.json(body, { status: res.status, headers: NO_STORE });
}
