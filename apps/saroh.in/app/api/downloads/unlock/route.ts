// POST /api/downloads/unlock {slug, email | phone, turnstileToken?} — get a
// free download (plan 2026-10-31-002 U9). GET: the Turnstile key.
//
// Mirrors `/api/tools/unlock`: forwarded to api.saroh.in with the signed
// visitor relay, only these fields go, and every answer is a typed state.
// The API is the authority on the contact (DEC-198 phone rules); here we
// only check there is exactly one.

import { NextResponse } from "next/server";

import { env } from "@/env";
import type {
    DownloadGateOptions,
    DownloadUnlockResult,
} from "@/lib/download-gate";
import { postedText, readPosted } from "@/lib/relay";
import { relayHeaders } from "@/lib/relay-headers";

const SLUG = /^[a-z0-9-]{1,80}$/;
const EMAILED = new Set(["sent", "limited", "not-sent", "none"]);

type Failure = Extract<DownloadUnlockResult, { unlocked: false }>["failure"];
const fail = (failure: Failure, status: number) =>
    NextResponse.json<DownloadUnlockResult>(
        { unlocked: false, failure },
        { status },
    );

/** The API's base and signed headers, or null (logged) when either is missing. */
function upstream(req: Request) {
    if (!env.API_URL) {
        console.error("[downloads] API_URL is not configured; request dropped");
        return null;
    }
    const headers = relayHeaders(req);
    if (!headers) {
        console.error(
            "[downloads] SITE_RELAY_SECRET is not set; request dropped",
        );
        return null;
    }
    return { base: `${env.API_URL}/public/downloads`, headers };
}

export async function GET(req: Request) {
    const none = NextResponse.json<DownloadGateOptions>({
        turnstileSiteKey: null,
    });
    const api = upstream(req);
    if (!api) return none;
    try {
        const res = await fetch(`${api.base}/options`, {
            headers: api.headers,
        });
        if (!res.ok) return none;
        const body = (await res.json()) as Partial<DownloadGateOptions>;
        return NextResponse.json<DownloadGateOptions>({
            turnstileSiteKey:
                typeof body.turnstileSiteKey === "string"
                    ? body.turnstileSiteKey
                    : null,
        });
    } catch {
        return none;
    }
}

export async function POST(req: Request) {
    const p = await readPosted(req);
    const slug = postedText(p, "slug", 80);
    const email = postedText(p, "email", 320);
    const phone = postedText(p, "phone", 32);
    const turnstileToken = postedText(p, "turnstileToken", 2048);

    // Our pages send their own slug; anything else is a bug, not a visitor's typo.
    if (!SLUG.test(slug)) {
        console.error("[downloads] unlock without a download's slug");
        return fail("unavailable", 400);
    }
    if (Boolean(email) === Boolean(phone)) return fail("bad-contact", 400);
    const api = upstream(req);
    if (!api) return fail("unavailable", 503);

    try {
        const res = await fetch(`${api.base}/unlock`, {
            method: "POST",
            headers: api.headers,
            body: JSON.stringify({
                slug,
                ...(email ? { email } : { phone }),
                ...(turnstileToken ? { turnstileToken } : {}),
            }),
        });
        if (res.status === 429) return fail("rate-limited", 429);
        if (res.status === 400) return fail("bad-contact", 400);
        if (res.status === 403) return fail("challenge", 403);
        if (res.status === 404) {
            // A page whose slug the API's `DOWNLOAD_NAMES` lacks: ours to fix.
            console.error(`[downloads] the API has no download "${slug}"`);
            return fail("unavailable", 502);
        }
        if (!res.ok) {
            console.error(`[downloads] unlock upstream ${res.status}`);
            return fail("unavailable", 502);
        }
        const body = (await res.json()) as { emailed?: unknown };
        const emailed =
            typeof body.emailed === "string" && EMAILED.has(body.emailed)
                ? (body.emailed as "sent" | "limited" | "not-sent" | "none")
                : "not-sent";
        return NextResponse.json<DownloadUnlockResult>({
            unlocked: true,
            emailed,
        });
    } catch (reason) {
        console.error("[downloads] unlock forward failed:", String(reason));
        return fail("unavailable", 502);
    }
}
