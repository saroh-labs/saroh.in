/**
 * Server-side session read for apps that gate access (RSC, route handlers,
 * server actions). It does NOT touch the database or build a Better Auth
 * instance — it forwards the request's Cookie to api.saroh.in's
 * `/api/auth/get-session` and returns the validated session. This keeps
 * every consuming app free of Prisma + BETTER_AUTH_SECRET; only api owns the
 * DB. Edge middleware should still use `@saroh/auth/middleware` (cookie
 * presence only), never this.
 */

/** Base URL of the auth server (api.saroh.in). It appends `/api/auth`. */
function authBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
        process.env.BETTER_AUTH_URL ??
        "https://api.saroh.in"
    );
}

export interface ServerSession {
    session: {
        id: string;
        userId: string;
        expiresAt: string;
        [key: string]: unknown;
    };
    user: {
        id: string;
        email: string;
        name?: string | null;
        emailVerified: boolean;
        image?: string | null;
        role?: string;
        [key: string]: unknown;
    };
}

/**
 * The three things that can be true of a request's session, kept apart.
 *
 * `anonymous` and `unavailable` used to collapse into the same `null`, and a
 * caller cannot recover a distinction the callee threw away. That mattered:
 * `requireSession()` turns "no session" into a redirect to accounts sign-in,
 * so one api blip — a restart, a timeout, a 502 — signed out every user on
 * their next server render. Only the api saying so (401/403) is evidence that
 * a session is invalid; a transport failure is evidence of nothing.
 *
 * This is the rule `AppShell` already applies to the module list, where a
 * failed fetch is `null` ("we don't know") rather than `[]` ("nothing is
 * enabled") so a transient error never blanks the shell. The session is the
 * one read that had not yet been given the same treatment.
 */
export type SessionResult =
    | { status: "authenticated"; session: ServerSession }
    /** Definitively signed out: no cookie, or the api rejected the one sent. */
    | { status: "anonymous" }
    /** The api could not be asked. Says nothing about whether a session exists. */
    | {
          status: "unavailable";
          reason: "network" | "http";
          statusCode?: number;
      };

/**
 * Thrown by a gate that needs a session and could not determine whether one
 * exists. Callers should surface a retry, never a sign-in redirect: the user
 * is probably still signed in, and sending them to accounts loses their place
 * for a fault that is ours.
 */
export class SessionUnavailableError extends Error {
    readonly reason: "network" | "http";
    readonly statusCode?: number;

    constructor(result: Extract<SessionResult, { status: "unavailable" }>) {
        super(
            result.reason === "network"
                ? "Could not reach the session service"
                : `Session service returned ${result.statusCode ?? "an error"}`,
        );
        this.name = "SessionUnavailableError";
        this.reason = result.reason;
        this.statusCode = result.statusCode;
    }
}

/**
 * Read + validate the session server-side by calling the api, keeping
 * "signed out" and "could not tell" apart. Prefer this over
 * `getServerSession` anywhere the answer decides whether to redirect.
 *
 * Pass the incoming request headers — in a Next RSC, `await headers()` from
 * `next/headers`; in a Node/Express context, a `Headers` built from the
 * request. Only the Cookie header is forwarded.
 */
export async function resolveServerSession(
    headers: Headers,
): Promise<SessionResult> {
    const cookie = headers.get("cookie");
    // Nothing to validate. Definitive, and costs no round trip.
    if (!cookie) return { status: "anonymous" };

    let res: Response;
    try {
        res = await fetch(`${authBaseUrl()}/api/auth/get-session`, {
            headers: { cookie },
            cache: "no-store",
        });
    } catch {
        // DNS, connection refused, TLS, timeout — the api never answered.
        return { status: "unavailable", reason: "network" };
    }

    // Only the api saying "this session is no good" is evidence of that.
    // 401/403 are that statement; a 500, a 502 from a restarting container, a
    // 429, or a 404 while a deploy swaps routes are all "ask again later".
    if (res.status === 401 || res.status === 403)
        return { status: "anonymous" };
    if (!res.ok) {
        return {
            status: "unavailable",
            reason: "http",
            statusCode: res.status,
        };
    }

    const data = (await res.json().catch(() => null)) as ServerSession | null;
    // Better Auth answers 200 with an empty body when the cookie is stale, so
    // a well-formed "no session here" is anonymous, not unavailable.
    return data?.session
        ? { status: "authenticated", session: data }
        : { status: "anonymous" };
}

/**
 * Read + validate the session server-side. Returns the `{ session, user }`
 * payload, or null when there is no valid session.
 *
 * Retained for callers that genuinely cannot act on the difference — chrome
 * that renders bare either way, and the accounts proxy. Anything that
 * redirects on null wants `resolveServerSession` instead, or it will treat an
 * api outage as a sign-out.
 */
export async function getServerSession(
    headers: Headers,
): Promise<ServerSession | null> {
    const result = await resolveServerSession(headers);
    return result.status === "authenticated" ? result.session : null;
}
