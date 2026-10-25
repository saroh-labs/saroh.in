import { cookies, headers } from "next/headers";
import { after } from "next/server";

import { apiBase } from "@/lib/api";

type Params = Record<string, string | string[] | undefined>;

const SOURCE_KEYS = ["src", "utm_source", "utm_medium", "utm_campaign"];

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Where the visitor came from: the sign-up link's own `src` and utm when it
 * carries any, else the `saroh_src` cookie saroh.in keeps on the shared
 * domain (`apps/saroh.in/lib/referral.ts`). Sent as is; the API checks each
 * value's shape and drops the rest.
 */
function sourceOf(params: Params, cookie: string | undefined) {
    const fromQuery = SOURCE_KEYS.some((key) => first(params[key]));
    const read = fromQuery
        ? (key: string) => first(params[key])
        : (key: string) => new URLSearchParams(cookie ?? "").get(key);
    return Object.fromEntries(
        SOURCE_KEYS.map((key) => [key, read(key) ?? undefined]),
    );
}

/** Which referral code was carried, never the code itself (DEC-187). */
function referralChannel(business: boolean, manager: boolean): string {
    if (business && manager) return "both";
    if (business) return "business";
    if (manager) return "account_manager";
    return "none";
}

/**
 * Tell the API someone opened the sign-up page (`signup_page_viewed`,
 * DEC-187 amended 24 Oct): an anonymous count, so the funnel shows who
 * leaves before making an account. No session, no cookie and no code goes
 * with it. Sent after the page has gone out (`after`), and a failure is
 * dropped: the page never waits for it or fails by it.
 *
 * Only a page render: a router prefetch or a Server Action's post is not
 * someone looking at the page.
 */
export async function recordSignupView(params: Params): Promise<void> {
    try {
        const incoming = await headers();
        if (incoming.get("next-router-prefetch") || incoming.get("next-action"))
            return;
        const jar = await cookies();
        const body = {
            ...sourceOf(params, jar.get("saroh_src")?.value),
            plan: first(params.plan),
            cycle: first(params.cycle),
            referral_channel: referralChannel(
                jar.has("saroh_ref"),
                jar.has("saroh_am"),
            ),
        };
        const agent = incoming.get("user-agent");
        const purpose = incoming.get("sec-purpose") ?? incoming.get("purpose");
        after(() =>
            fetch(`${apiBase()}/public/funnel/signup-viewed`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(agent ? { "user-agent": agent } : {}),
                    ...(purpose ? { "sec-purpose": purpose } : {}),
                },
                body: JSON.stringify(body),
                cache: "no-store",
            }).catch(() => undefined),
        );
    } catch {
        // A lost view is a count one short, never a page that fails.
    }
}
