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
 * Read + validate the session server-side by calling the api. Returns the
 * `{ session, user }` payload, or null when there is no valid session.
 *
 * Pass the incoming request headers — in a Next RSC, `await headers()` from
 * `next/headers`; in a Node/Express context, a `Headers` built from the
 * request. Only the Cookie header is forwarded.
 */
export async function getServerSession(
    headers: Headers,
): Promise<ServerSession | null> {
    const cookie = headers.get("cookie");
    if (!cookie) return null;

    let res: Response;
    try {
        res = await fetch(`${authBaseUrl()}/api/auth/get-session`, {
            headers: { cookie },
            cache: "no-store",
        });
    } catch {
        // Network/api failure → treat as unauthenticated (fail closed).
        return null;
    }

    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as ServerSession | null;
    return data?.session ? data : null;
}
