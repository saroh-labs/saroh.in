// POST /api/waitlist
//
// Only api.saroh.in touches the database (single-backend refactor), so this
// route is a thin forwarder to the public waitlist endpoint there. It used to
// `console.log` the address and return success, which meant every signup since
// launch was acknowledged to the visitor and then dropped.
//
// It stays a server route rather than the form posting to api.saroh.in
// directly: that keeps the API origin out of the browser bundle, avoids a CORS
// preflight on the conversion path, gives one place to sign the visitor's
// address for the API's rate limit (`lib/waitlist-forward.ts`), and one place
// to translate the API's response into the `{status}` shape the waitlist
// form reads.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type { WaitlistResponse } from "@/lib/waitlist";
import {
    forwardHeaders,
    joinBody,
    relaySecret,
    visitorCountry,
} from "@/lib/waitlist-forward";

let warnedNoSecret = false;

export async function POST(req: Request) {
    let posted: unknown;
    try {
        posted = await req.json();
    } catch {
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "BAD_REQUEST" } },
            { status: 400 },
        );
    }

    const join = joinBody(posted);
    if (!join) {
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "BAD_REQUEST" } },
            { status: 400 },
        );
    }
    const country = visitorCountry(req.headers);
    const body = country ? { ...join, country } : join;

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

    const secret = relaySecret(env.SITE_RELAY_SECRET, env.NODE_ENV);
    if (!secret && !warnedNoSecret) {
        // The join still goes through; the API then counts every visitor as
        // this server, so one busy minute can refuse everyone. Set it.
        warnedNoSecret = true;
        console.error(
            "[waitlist] SITE_RELAY_SECRET is not set; the API rate-limits all visitors as one",
        );
    }

    try {
        const send = (payload: typeof body) =>
            fetch(`${env.API_URL}/public/waitlist`, {
                method: "POST",
                headers: forwardHeaders({
                    headers: req.headers,
                    host: new URL(req.url).host,
                    secret,
                }),
                body: JSON.stringify(payload),
            });
        let upstream = await send(body);
        // An API from before `country` refuses the field it doesn't know
        // (forbidNonWhitelisted): during a release the site can go live a few
        // minutes before the API. The country is a nice-to-have; the join
        // isn't, so it goes again without it. A refusal is answered before
        // the API's rate limit counts, so this costs the visitor nothing.
        if (upstream.status === 400 && country) {
            upstream = await send(join);
        }

        if (upstream.status === 429) {
            return NextResponse.json<WaitlistResponse>(
                { status: "failure", reason: { code: "RATE_LIMITED" } },
                { status: 429 },
            );
        }

        if (upstream.status === 400) {
            // The API refused a field. Its message is about the field, never
            // the visitor's data, and the page shows its own words for it.
            return NextResponse.json<WaitlistResponse>(
                { status: "failure", reason: { code: "INVALID" } },
                { status: 400 },
            );
        }

        if (!upstream.ok) {
            console.error(`[waitlist] upstream ${upstream.status}`);
            return NextResponse.json<WaitlistResponse>(
                { status: "failure", reason: { code: "UPSTREAM" } },
                { status: 502 },
            );
        }

        const joined = (await upstream.json()) as {
            created?: boolean;
            position?: number;
            ref?: string | null;
        };
        return NextResponse.json<WaitlistResponse>(
            joined.created
                ? {
                      status: "success",
                      created: true,
                      position: joined.position,
                      ref: joined.ref ?? undefined,
                      ...(country && country !== "IN"
                          ? { outsideIndia: true }
                          : {}),
                  }
                : {
                      status: "success",
                      created: false,
                      ...(country && country !== "IN"
                          ? { outsideIndia: true }
                          : {}),
                  },
        );
    } catch (reason) {
        console.error("[waitlist] forward failed:", String(reason));
        return NextResponse.json<WaitlistResponse>(
            { status: "failure", reason: { code: "UPSTREAM" } },
            { status: 502 },
        );
    }
}
