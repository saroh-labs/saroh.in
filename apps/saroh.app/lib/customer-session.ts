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
 * one host and no other merchant's site ever receives it. It lasts as long
 * as a session can (90 days from sign-in): a session slides while it is
 * used, so the API — not the cookie — says when it has ended (review A-5).
 * Browser scripts cannot read it; this server forwards it to the API in
 * `x-customer-session`, beside the signed relay, and the API accepts it
 * only on the host it was issued for.
 */
export const SESSION_COOKIE = "__Host-saroh_session";
export const CUSTOMER_SESSION_HEADER = "x-customer-session";

/**
 * How long the cookie lives: the API's longest session (`SESSION_MAX_AGE_MS`
 * in `sessions.service.ts`). A session's own `expiresAt` is only where it
 * stood at sign-in; it slides with every visit.
 */
export const SESSION_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60_000;

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

/**
 * Keep a new session, for as long as any session can last. Server actions
 * and route handlers only.
 */
export async function setSessionCookie(
    token: string,
    now: Date = new Date(),
): Promise<void> {
    (await cookies()).set(
        sessionCookie(
            token,
            new Date(now.getTime() + SESSION_COOKIE_MAX_AGE_MS),
        ),
    );
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
    | {
          ok: false;
          reason: "no-host" | "no-address" | "unreachable" | "unconfigured";
      };

/**
 * The relay for this request, or "unconfigured" when this server has no
 * `SITE_RELAY_SECRET` to sign it with. That is Saroh's misconfiguration,
 * not the visitor's: the page stays up, the sheet says the code couldn't be
 * sent, and an ERROR says why (review M-1).
 */
function signedRelay(
    requestHeaders: Headers,
    host: string,
): { ok: true; relay: string | null } | { ok: false } {
    try {
        return { ok: true, relay: relayFor(requestHeaders, host) };
    } catch (error) {
        console.error(
            JSON.stringify({
                level: "error",
                event: "site_relay_secret_missing",
                message: error instanceof Error ? error.message : String(error),
            }),
        );
        return { ok: false };
    }
}

/**
 * Call `public/site-accounts/<path>` with the signed relay for the host this
 * request is on. Every call from this app to those routes goes through here
 * (or {@link accountFetch}, which adds the session).
 */
export async function siteAccountsFetch(
    path: string,
    init: { method?: string; body?: unknown; session?: string } = {},
): Promise<SiteCall> {
    return relayedFetch(`/public/site-accounts/${path}`, init);
}

/**
 * Call `public/sites/<path>` with the signed relay, and the session when
 * `session` is given — the site's checkout (G13), whose routes hang off the
 * site.
 */
export async function sitesFetch(
    path: string,
    init: { method?: string; body?: unknown; session?: string } = {},
): Promise<SiteCall> {
    return relayedFetch(`/public/sites/${path}`, init);
}

async function relayedFetch(
    apiPath: string,
    init: { method?: string; body?: unknown; session?: string },
): Promise<SiteCall> {
    const requestHeaders = await headers();
    const host = servedHost(requestHeaders);
    if (!host) return { ok: false, reason: "no-host" };
    const signed = signedRelay(requestHeaders, host);
    if (!signed.ok) return { ok: false, reason: "unconfigured" };
    const relay = signed.relay;
    if (!relay) return { ok: false, reason: "no-address" };
    const sent: Record<string, string> = {
        accept: "application/json",
        [SITE_RELAY_HEADER]: relay,
    };
    if (init.session) sent[CUSTOMER_SESSION_HEADER] = init.session;
    if (init.body !== undefined) sent["content-type"] = "application/json";
    try {
        const res = await fetch(`${API_URL}${apiPath}`, {
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
 * Whether a 401 says the session itself is over (revoked, expired, or a
 * token that isn't this site's): `details.reason` is `signed-out`. Any
 * other 401 — a relay the API couldn't check — says nothing about the
 * session, and signing the customer out for it would lose them for good.
 */
async function sessionEnded(res: Response): Promise<boolean> {
    if (res.status !== 401) return false;
    const body = (await res
        .clone()
        .json()
        .catch(() => null)) as {
        details?: { reason?: unknown };
        error?: { details?: { reason?: unknown } };
    } | null;
    const reason = body?.error?.details?.reason ?? body?.details?.reason;
    return reason === "signed-out";
}

/**
 * Call a signed-in customer route with this request's session. Null when
 * there is no session; a 401 that says the session is over clears the
 * cookie (review A-6).
 */
export async function accountFetch(
    path: string,
    init: { method?: string; body?: unknown } = {},
): Promise<SiteCall | null> {
    const session = await readSessionToken();
    if (!session) return null;
    const call = await siteAccountsFetch(path, { ...init, session });
    if (call.ok && (await sessionEnded(call.res))) await clearSessionCookie();
    return call;
}

/**
 * {@link accountFetch} for a signed-in route under `public/sites/` (the
 * checkout, G13): null without a session, and a 401 that ends it clears the
 * cookie.
 */
export async function accountSitesFetch(
    path: string,
    init: { method?: string; body?: unknown } = {},
): Promise<SiteCall | null> {
    const session = await readSessionToken();
    if (!session) return null;
    const call = await sitesFetch(path, { ...init, session });
    if (call.ok && (await sessionEnded(call.res))) await clearSessionCookie();
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
