import { fromNodeHeaders } from "better-auth/node";

import { type Auth, createAuth } from "./server";

let instance: Auth | undefined;

function authInstance(): Auth {
    if (!instance) instance = createAuth();
    return instance;
}

/**
 * Read + validate the accounts session server-side (RSC, route handlers,
 * server actions). Node runtime only — it builds the shared DB-backed
 * Better Auth instance, so it must not be imported into Edge middleware
 * (use `@saroh/auth/middleware` there). Consumed only by apps that gate
 * access (`app`, `admin`) and already carry DB + BETTER_AUTH_SECRET.
 *
 * Pass the request headers — in a Next RSC, `headers()` from `next/headers`;
 * in a Node/Express context, `fromNodeHeaders(req.headers)`.
 */
export async function getServerSession(headers: Headers) {
    return authInstance().api.getSession({ headers });
}

export { fromNodeHeaders };
