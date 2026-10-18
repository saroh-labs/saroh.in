import { requestOrigin } from "@saroh/auth/origins";
import { headers } from "next/headers";

import { env } from "@/env";

/**
 * The API, from this app's server: every call forwards the visitor's own
 * session cookie, so the API answers for them and nobody else. Server-only
 * (it reads the request's headers); a client component reaches it through
 * a Server Action.
 */

export function apiBase(): string {
    if (env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
    }
    return env.NODE_ENV === "production"
        ? "https://api.saroh.in"
        : "https://api.saroh.localhost";
}

/** A request to the API as the visitor. */
export async function apiFetch(
    path: string,
    init: { method?: string; body?: unknown } = {},
): Promise<Response> {
    const incoming = await headers();
    const cookie = incoming.get("cookie") ?? "";
    // The API refuses a write that names no origin (#50, `OriginGuard`); a
    // server-side fetch sends none of its own, so say where this came from.
    const origin = requestOrigin(incoming);
    return fetch(`${apiBase()}${path}`, {
        method: init.method ?? "GET",
        headers: {
            cookie,
            ...(origin ? { origin } : {}),
            ...(init.body !== undefined
                ? { "content-type": "application/json" }
                : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: "no-store",
    });
}

/** A GET whose answer is JSON; throws (with the status) when it isn't ok. */
export async function apiGet<T>(path: string): Promise<T> {
    const res = await apiFetch(path);
    if (!res.ok) throw new ApiReadError(path, res.status);
    return (await res.json()) as T;
}

/** A read the API refused or couldn't answer, with its status. */
export class ApiReadError extends Error {
    constructor(
        path: string,
        readonly status: number,
    ) {
        super(`GET ${path} failed: ${status}`);
        this.name = "ApiReadError";
    }
}

/** What a write answered: its data, or the API's words for a refusal. */
export type ApiResult<T> =
    | { ok: true; data: T }
    | {
          ok: false;
          status: number;
          error: string;
          field?: string;
          code?: string;
      };

/** The fallback when the API sent no words of its own. */
export const WRITE_FAILED =
    "That couldn't be saved just now. Nothing has been changed. Try again.";

/** A write as the visitor, its refusal read into words and a field. */
export async function apiWrite<T>(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
): Promise<ApiResult<T>> {
    let res: Response;
    try {
        res = await apiFetch(path, { method, body });
    } catch {
        return { ok: false, status: 0, error: WRITE_FAILED };
    }
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    return { ok: false, status: res.status, ...(await refusalOf(res)) };
}

/**
 * A refusal's words, field and code. The API's errors come in its envelope,
 * `{ error: { message, details } }` (AllExceptionsFilter); a bare
 * `{ message, details }` is read too.
 */
export async function refusalOf(
    res: Response,
): Promise<{ error: string; field?: string; code?: string }> {
    try {
        const raw = (await res.json()) as {
            message?: unknown;
            details?: { field?: unknown; code?: unknown };
            error?: unknown;
        };
        const body =
            raw.error && typeof raw.error === "object"
                ? (raw.error as typeof raw)
                : raw;
        const message =
            typeof body.message === "string" && res.status < 500
                ? body.message
                : WRITE_FAILED;
        const field =
            typeof body.details?.field === "string"
                ? body.details.field
                : undefined;
        const code =
            typeof body.details?.code === "string"
                ? body.details.code
                : undefined;
        return { error: message, field, code };
    } catch {
        return { error: WRITE_FAILED };
    }
}
