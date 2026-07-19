import { cookies, headers } from "next/headers";

import { env } from "@/env";

/**
 * Shared org-scoped HTTP plumbing for the CRM clients (contacts, leads,
 * pipelines — S3-005). Every call is org-scoped: the active organization id
 * (from the `active_org` cookie) is used both in the path
 * (`/organizations/:organizationId/...`) and forwarded as the
 * `x-organization-id` header — mirroring `lib/sites/service.ts`. The request's
 * session cookie is forwarded so api.saroh.in derives the user and enforces org
 * membership + the CRM role policy. Server-only: imports next/headers, so it
 * must never reach a client component. The app never imports @saroh/database —
 * these clients reach data only through the API.
 */

const API_URL =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

/** Cookie holding the active organization id (readable server-side). */
const ACTIVE_ORG_COOKIE = "active_org";

/** Discriminated result so a client component can surface a message inline. */
export type CrmResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** The active organization id from the cookie, or null when unset. */
export async function getActiveOrgId(): Promise<string | null> {
    return (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

/** Base path for the active org, or null when no org is active. */
export async function orgBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}` : null;
}

export async function apiFetch(
    path: string,
    init?: RequestInit,
): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    const activeOrgId = await getActiveOrgId();
    return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            ...(activeOrgId ? { "x-organization-id": activeOrgId } : {}),
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

/** Extract a human message from a JSON error body. */
export function readError(
    data: { message?: string; error?: string } | null,
    fallback: string,
): string {
    return data?.message ?? data?.error ?? fallback;
}

/**
 * POST/PATCH helper returning a {@link CrmResult}. Forwards the session cookie
 * + active-org header; a non-2xx response becomes `{ ok: false, error }`.
 */
export async function mutate<T>(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    fallback: string,
): Promise<CrmResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
        | (T & { message?: string; error?: string })
        | null;
    if (res.ok) {
        return { ok: true, data: (data ?? {}) as T };
    }
    return { ok: false, error: readError(data, fallback) };
}
