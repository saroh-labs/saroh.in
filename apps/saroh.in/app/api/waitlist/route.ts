// POST /api/waitlist
//
// Only api.saroh.in touches the database (single-backend refactor), so this
// route is a thin forwarder to the public waitlist endpoint there. It used to
// `console.log` the address and return success, which meant every signup since
// launch was acknowledged to the visitor and then dropped.
//
// It stays a server route rather than the form posting to api.saroh.in
// directly: that keeps the API origin out of the browser bundle, avoids a CORS
// preflight on the conversion path, and gives one place to translate the API's
// response into the shape this form already understands.

import { NextResponse } from "next/server";

import { env } from "@/env";

/** The response contract the existing client form expects. */
type WaitlistResponse =
    | { status: "success"; created?: boolean }
    | { status: "failure"; reason?: { code?: string } };

export async function POST(req: Request) {
    let email: string | undefined;
    try {
        ({ email } = (await req.json()) as { email?: string });
    } catch {
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "BAD_REQUEST" } },
            { status: 400 },
        );
    }

    if (!email) {
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "BAD_REQUEST" } },
            { status: 400 },
        );
    }

    if (!env.API_URL) {
        // Fail loudly rather than pretending to have stored it. A visitor being
        // told "you're on the list" when nothing was written is the bug this
        // route previously had.
        console.error("[waitlist] API_URL is not configured; signup dropped");
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "NOT_CONFIGURED" } },
            { status: 500 },
        );
    }

    try {
        const upstream = await fetch(`${env.API_URL}/public/waitlist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // The API rate-limits per source IP; without this every signup
                // looks like it came from this server and one visitor could
                // exhaust the window for everyone.
                "X-Forwarded-For":
                    req.headers.get("x-forwarded-for") ??
                    req.headers.get("x-real-ip") ??
                    "",
            },
            body: JSON.stringify({ email, source: "saroh.in" }),
        });

        if (upstream.status === 429) {
            return NextResponse.json<WaitlistResponse>(
                { status: "failure", reason: { code: "RATE_LIMITED" } },
                { status: 429 },
            );
        }

        if (!upstream.ok) {
            const body = await upstream.text();
            console.error(
                `[waitlist] upstream ${upstream.status}: ${body.slice(0, 200)}`,
            );
            return NextResponse.json<WaitlistResponse>(
                { status: "failure", reason: { code: "UPSTREAM" } },
                { status: 502 },
            );
        }

        const { created } = (await upstream.json()) as { created?: boolean };
        return NextResponse.json<WaitlistResponse>({
            status: "success",
            created,
        });
    } catch (reason) {
        console.error("[waitlist] forward failed:", reason);
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "UPSTREAM" } },
            { status: 502 },
        );
    }
}
