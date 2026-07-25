import { cookies, headers } from "next/headers";
import { cache } from "react";

import { env } from "@/env";

/**
 * Canonical org-scoped HTTP plumbing for every app.saroh.in data-access client
 * (S3-005 CRM, stores, products, orders, sites, forms, members, content,
 * notifications, analytics, …). This is the single source of the fetch
 * plumbing: services import `apiFetch`/`getActiveOrgId`/`orgBase`/`getJson`/
 * `getList` from here instead of re-declaring their own copies.
 *
 * Every call forwards the request's session cookie so api.saroh.in derives the
 * user and enforces org membership + the relevant role policy. Org-scoped calls
 * additionally carry the active organization id (from the `active_org` cookie)
 * both in the path (`/organizations/:organizationId/...`) and as the
 * `x-organization-id` header — switching orgs actually changes the context
 * server components read. Server-only: imports next/headers, so it must never
 * reach a client component. The app never imports @saroh/database — these
 * clients reach data only through the API.
 */

const API_URL =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

/** Cookie holding the active organization id (readable server-side). */
export const ACTIVE_ORG_COOKIE = "active_org";

/** Discriminated result so a client component can surface a message inline. */
export type CrmResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Member organization ids for the session, newest-first as the API returns
 * them. Uses a bare `fetch` — NOT `apiFetch` — because `apiFetch` resolves the
 * active org through this function, and going through it would recurse.
 * Request-cached, so the reconciliation below costs one call per render pass.
 */
const memberOrgIds = cache(async (): Promise<string[] | null> => {
    const cookie = (await headers()).get("cookie") ?? "";
    const res = await fetch(`${API_URL}/organizations`, {
        headers: { "content-type": "application/json", cookie },
        cache: "no-store",
    });
    if (!res.ok) return null;
    const orgs = (await res.json().catch(() => null)) as
        | { id: string }[]
        | null;
    return Array.isArray(orgs) ? orgs.map((o) => o.id) : null;
});

/**
 * The active organization id: the `active_org` cookie when the caller is still
 * a member of it, otherwise their first organization.
 *
 * The fallback is not cosmetic. The cookie is written ONLY when someone creates
 * an org or explicitly switches, so a user who joined by invitation (or whose
 * session outlived a membership) has none — and reading it raw made every
 * org-scoped call either silently empty (no cookie → no request) or a 403
 * (stale cookie → foreign org). Resolving against real membership here is what
 * makes the data layer agree with the chrome, which has always fallen back to
 * the first org (`resolveActiveOrganization`). A failed org-list lookup leaves
 * the cookie value untouched, so an API outage degrades exactly as before
 * rather than silently retargeting the tenant.
 */
export const getActiveOrgId = cache(async (): Promise<string | null> => {
    const cookieId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null;
    const ids = await memberOrgIds();
    if (ids === null) return cookieId;
    if (cookieId && ids.includes(cookieId)) return cookieId;
    return ids[0] ?? null;
});

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

/**
 * Extract a human message from a JSON error body.
 *
 * Handles all three shapes we actually receive: a bare `{ message }`, a legacy
 * `{ error: "text" }`, and api.saroh.in's standard envelope
 * `{ error: { code, message, ... } }` (see AllExceptionsFilter). The last one
 * used to fall through and return the error OBJECT from a `string`-typed
 * function, so callers rendered "[object Object]" instead of the reason.
 */
export function readError(
    data: {
        message?: string;
        error?: string | { message?: string };
    } | null,
    fallback: string,
): string {
    if (typeof data?.message === "string") return data.message;
    const error = data?.error;
    if (typeof error === "string") return error;
    if (error && typeof error.message === "string") return error.message;
    return fallback;
}

/**
 * GET a single resource, distinguishing a genuine absence from a real failure
 * (#101): a 404 → `null` (the resource legitimately doesn't exist), any other
 * non-2xx → THROW so the failure surfaces via the route error boundary
 * (app/error.tsx) rather than masquerading as an empty/absent resource. A
 * network error rejects naturally (not caught). A 2xx returns the parsed body.
 */
export async function getJson<T>(path: string): Promise<T | null> {
    const res = await apiFetch(path);
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`GET ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
}

/**
 * GET a collection: like {@link getJson} but 404/absent → `[]`. A 5xx or
 * network failure THROWS (never a silent empty list), so an outage renders the
 * error boundary instead of an indistinguishable "no items yet" empty state.
 */
export async function getList<T>(path: string): Promise<T[]> {
    const v = await getJson<T[]>(path);
    return v ?? [];
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
