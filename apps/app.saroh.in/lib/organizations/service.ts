import { cookies, headers } from "next/headers";

import { env } from "@/env";

/**
 * Organization data access for app.saroh.in. Organization is the tenant root
 * (ADR-001): every org-scoped API call carries the active organization id in
 * the `x-organization-id` header, resolved here from the `active_org` cookie so
 * switching orgs actually changes the context server components read. Forwards
 * the session cookie to api.saroh.in, which derives the user from the session
 * and enforces membership (a non-member org → 403, handled gracefully).
 * Server-only: imports next/headers.
 */

const API_URL =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

/** Cookie holding the active organization id (readable server-side). */
export const ACTIVE_ORG_COOKIE = "active_org";

export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";

/** A membership row as returned by GET /organizations. */
export interface Organization {
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
}

export interface OrganizationProfileInput {
    legalName?: string;
    type?: string;
    country?: string;
    taxId?: string;
    contactEmail?: string;
    website?: string;
}

export interface CreateOrganizationInput {
    name: string;
    profile?: OrganizationProfileInput;
}

/** Discriminated result so the UI can surface field errors inline. */
export type OrganizationResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: "name" };

/** The active organization id from the cookie, or null when unset. */
export async function getActiveOrgId(): Promise<string | null> {
    return (await cookies()).get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    const activeOrgId = await getActiveOrgId();
    return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            // Org-scoped routes read the active org from this header; the API
            // 403s if the caller isn't a member, so switching is safe.
            ...(activeOrgId ? { "x-organization-id": activeOrgId } : {}),
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

/** The caller's organizations with their role. Empty on any failure. */
export async function listOrganizations(): Promise<Organization[]> {
    const res = await apiFetch("/organizations");
    if (!res.ok) return [];
    return (await res.json()) as Organization[];
}

/**
 * The resolved active organization: the one named by the `active_org` cookie
 * when the caller is still a member of it, otherwise the first organization
 * (a safe default that also self-heals a stale cookie). Null when the caller
 * belongs to no organization — the zero-org funnel case.
 */
export async function resolveActiveOrganization(): Promise<Organization | null> {
    const organizations = await listOrganizations();
    if (organizations.length === 0) return null;
    const activeOrgId = await getActiveOrgId();
    return organizations.find((o) => o.id === activeOrgId) ?? organizations[0];
}

/** The resolved context for an org (requires membership); null on 403/404. */
export async function getOrganization(
    organizationId: string,
): Promise<Organization | null> {
    const res = await apiFetch(`/organizations/${organizationId}`);
    if (!res.ok) return null;
    return (await res.json()) as Organization;
}

/**
 * Onboarding: create an organization. The caller becomes OWNER (ownership is
 * derived from the session server-side, never trusted from the client).
 */
export async function createOrganization(
    input: CreateOrganizationInput,
): Promise<OrganizationResult<{ id: string; slug: string }>> {
    const res = await apiFetch("/organizations", {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        slug?: string;
        message?: string;
        field?: "name";
    } | null;

    if (res.ok && data?.id && data.slug) {
        return { ok: true, data: { id: data.id, slug: data.slug } };
    }
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        field: data?.field,
    };
}
