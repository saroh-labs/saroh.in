import { toFailure } from "@/lib/api/failure";
import { apiFetch, getActiveOrgId } from "@/lib/api/http";

/**
 * Organization data access for app.saroh.in. Organization is the tenant root
 * (ADR-001): every org-scoped API call carries the active organization id in
 * the `x-organization-id` header, resolved from the `active_org` cookie so
 * switching orgs actually changes the context server components read. Forwards
 * the session cookie to api.saroh.in, which derives the user from the session
 * and enforces membership (a non-member org → 403, handled gracefully).
 * Server-only: imports next/headers (via the shared HTTP plumbing).
 */

/**
 * REVIEWER joined the set in #276: website-only, and narrowed further to the
 * sites it was invited to. The API is the authority — this type exists so the
 * UI can name a role, not decide one.
 */
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";

/** A membership row as returned by GET /organizations. */
export interface Organization {
    id: string;
    name: string;
    slug: string;
    /** The built-in this maps to; MEMBER for a role the business invented. */
    role: OrganizationRole;
    /** The role as stored — a built-in name, or an invented role's key. */
    roleKey?: string;
    /** What it is called on screen. */
    roleLabel?: string | null;
    /**
     * What this actor may do here, resolved by the API.
     *
     * Optional so a cached or older response still renders: the nav falls back
     * to the built-in map when it is absent.
     */
    actions?: string[];
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
    /**
     * The `<address>.saroh.app` the business reserves — its first website is
     * served there. Absent, the API derives it from the name.
     */
    address?: string;
}

/** Discriminated result so the UI can surface field errors inline. */
export type OrganizationResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: "name" | "address" };

/** Whether an address can be reserved at setup, and why not. */
export interface AddressAvailability {
    address: string;
    available: boolean;
    reason?: string;
}

/**
 * The caller's organizations with their role. Empty on ANY failure — this
 * intentionally does NOT throw (unlike getList): it powers `AppHeader`, which
 * renders in the root layout on every authenticated page and must degrade to
 * rendering nothing rather than tripping the global error boundary when the
 * org list can't load. (#101 error-vs-empty distinction is applied to the
 * page-level reads, not this always-present chrome.)
 */
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
 *
 * Pass `organizations` when the caller has already fetched the list to avoid a
 * second identical round-trip (#102); otherwise it is fetched here.
 */
export async function resolveActiveOrganization(
    organizations?: Organization[],
): Promise<Organization | null> {
    const orgs = organizations ?? (await listOrganizations());
    if (orgs.length === 0) return null;
    const activeOrgId = await getActiveOrgId();
    return orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
}

/** The resolved context for an org (requires membership); null on 403/404. */
export async function getOrganization(
    organizationId: string,
): Promise<Organization | null> {
    const res = await apiFetch(`/organizations/${organizationId}`);
    // 403 (non-member) is a legitimate "not accessible", not a server failure:
    // return null rather than throwing so a stale/foreign id degrades cleanly.
    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) {
        throw new Error(
            `GET /organizations/${organizationId} failed: ${res.status}`,
        );
    }
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
    } | null;

    if (res.ok && data?.id && data.slug) {
        return { ok: true, data: { id: data.id, slug: data.slug } };
    }
    // The API's envelope is `{ error: { message, details } }`.
    const failure = toFailure(data, "Something went wrong");
    return {
        ok: false,
        error: failure.error,
        field:
            failure.field === "name" || failure.field === "address"
                ? failure.field
                : undefined,
    };
}

/**
 * Whether an address is free to reserve. Null when the API could not be asked
 * — the form then says nothing rather than guessing, and the create checks it
 * again anyway.
 */
export async function checkOrganizationAddress(
    address: string,
): Promise<AddressAvailability | null> {
    const res = await apiFetch(
        `/organizations/address-availability?address=${encodeURIComponent(address)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as AddressAvailability;
}
