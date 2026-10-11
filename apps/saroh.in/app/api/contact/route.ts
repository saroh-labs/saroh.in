// POST /api/contact {topic, name, email, kind?, message} — /contact's form
//
// Forwarded to api.saroh.in's public `POST /public/contact-messages`
// (DEC-137), as `/api/business-reports` forwards a report: the API origin
// stays out of the browser, there is no CORS preflight, and the visitor's
// address is signed into `x-saroh-relay` for the API's per-visitor limit
// (`lib/waitlist-forward.ts`). Only the five fields go on.
//
// It never says "sent" for a message the API did not take: with no API, or
// one that fails, the form is told so and shows the address to write to.
// Nothing a visitor typed is logged, only what went wrong.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type { ContactResult } from "@/lib/contact-message";
import { contactBody } from "@/lib/contact-message";
import { forwardHeaders, relaySecret } from "@/lib/waitlist-forward";

export async function POST(req: Request) {
    const fail = (
        failure: Extract<ContactResult, { sent: false }>["failure"],
        status: number,
    ) => NextResponse.json<ContactResult>({ sent: false, failure }, { status });

    let posted: unknown;
    try {
        posted = await req.json();
    } catch {
        posted = null;
    }
    const body = contactBody(posted);
    // Not a message from the form at all: no topic the form offers.
    if (!body) return fail("message", 400);
    if ("problem" in body) return fail(body.problem, 400);

    if (!env.API_URL) {
        console.error("[contact] API_URL is not configured; message not sent");
        return fail("unavailable", 503);
    }

    try {
        const upstream = await fetch(`${env.API_URL}/public/contact-messages`, {
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
        // the email, which it reads more strictly.
        if (upstream.status === 400) return fail("email", 400);
        if (!upstream.ok) {
            console.error(`[contact] upstream ${upstream.status}`);
            return fail("unavailable", 502);
        }
        return NextResponse.json<ContactResult>({ sent: true });
    } catch (reason) {
        console.error("[contact] forward failed:", String(reason));
        return fail("unavailable", 502);
    }
}
