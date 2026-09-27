import { cookies, headers } from "next/headers";

import type { SignedInCustomer } from "@saroh/site-blocks";

import { env } from "@/env";

import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

/**
 * A customer's session on a merchant's site, from this server's side
 * (ADR-011; round-2 plan A, A3, default 6).
 *
 * The token lives in a `__Host-` cookie: Secure, HttpOnly, SameSite=Lax,
 * Path=/ and — what the prefix enforces — no Domain, so it belongs to this
 * one host and no other merchant's site ever receives it. It expires with
 * the session. Browser scripts cannot read it; this server forwards it to
 * the API in `x-customer-session`, beside the signed relay, and the API
 * accepts it only on the host it was issued for.
 */
export const SESSION_COOKIE = "__Host-saroh_session";
export const CUSTOMER_SESSION_HEADER = "x-customer-session";

const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

export interface SessionCookie {
    name: string;
    value: string;
    httpOnly: true;
    secure: true;
    sameSite: "lax";
    path: "/";
    expires: Date;
}

/** The cookie that carries a session. Never a `domain`: see above. */
export function sessionCookie(token: string, expiresAt: Date): SessionCookie {
    return {
        name: SESSION_COOKIE,
        value: token,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
    };
}

/**
 * The cookie that clears one. A `__Host-` cookie is only replaced by one
 * with the same attributes, so this is a full cookie, empty and expired —
 * `cookies().delete(name)` sends no `Secure` and the browser ignores it.
 */
export function clearedSessionCookie(): SessionCookie {
    return sessionCookie("", new Date(0));
}

/** The session token on this request, if any. */
export async function readSessionToken(): Promise<string | null> {
    const value = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!value) return null;
    return value;
}

/** Keep a new session. Server actions and route handlers only. */
export async function setSessionCookie(
    token: string,
    expiresAt: Date,
): Promise<void> {
    (await cookies()).set(sessionCookie(token, expiresAt));
}

/** Forget the session. Where cookies can't be written (a page render), a no-op. */
export async function clearSessionCookie(): Promise<void> {
    try {
        (await cookies()).set(clearedSessionCookie());
    } catch {
        // Rendering a Server Component: the next action clears it instead.
        // The API refuses the token either way, so nobody stays signed in.
    }
}

export type SiteCall =
    | { ok: true; res: Response }
    | { ok: false; reason: "no-host" | "no-address" | "unreachable" };

/**
 * Call `public/site-accounts/<path>` with the signed relay for the host this
 * request is on. Every call from this app to those routes goes through here
 * (or {@link accountFetch}, which adds the session).
 */
export async function siteAccountsFetch(
    path: string,
    init: { method?: string; body?: unknown; session?: string } = {},
): Promise<SiteCall> {
    const requestHeaders = await headers();
    const host = servedHost(requestHeaders);
    if (!host) return { ok: false, reason: "no-host" };
    const relay = relayFor(requestHeaders, host);
    if (!relay) return { ok: false, reason: "no-address" };
    const sent: Record<string, string> = {
        accept: "application/json",
        [SITE_RELAY_HEADER]: relay,
    };
    if (init.session) sent[CUSTOMER_SESSION_HEADER] = init.session;
    if (init.body !== undefined) sent["content-type"] = "application/json";
    try {
        const res = await fetch(`${API_URL}/public/site-accounts/${path}`, {
            method: init.method ?? "GET",
            cache: "no-store",
            headers: sent,
            body:
                init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
        return { ok: true, res };
    } catch {
        return { ok: false, reason: "unreachable" };
    }
}

/**
 * Call a signed-in customer route with this request's session. Null when
 * there is no session; a 401 clears the cookie (revoked, expired, or a
 * token that isn't this site's).
 */
export async function accountFetch(
    path: string,
    init: { method?: string; body?: unknown } = {},
): Promise<SiteCall | null> {
    const session = await readSessionToken();
    if (!session) return null;
    const call = await siteAccountsFetch(path, { ...init, session });
    if (call.ok && call.res.status === 401) await clearSessionCookie();
    return call;
}

function isCustomer(body: unknown): body is SignedInCustomer {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    return (
        typeof b.email === "string" &&
        (b.name === null || typeof b.name === "string")
    );
}

/** Who is signed in on this site, or null. */
export async function getSignedInCustomer(): Promise<SignedInCustomer | null> {
    const call = await accountFetch("session");
    if (!call?.ok || !call.res.ok) return null;
    const body: unknown = await call.res.json().catch(() => null);
    return isCustomer(body) ? { email: body.email, name: body.name } : null;
}
