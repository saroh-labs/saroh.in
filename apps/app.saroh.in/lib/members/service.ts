import { apiFetch } from "@/lib/api/http";

/**
 * Members + invitations data access for app.saroh.in. Like the stores client,
 * the app never touches the DB — every call forwards the session cookie to
 * api.saroh.in, which enforces owner-only management and the email-match rule
 * on accept. Server-only: imports next/headers (via the shared HTTP plumbing).
 */

export type MemberRole = "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";

export interface Member {
    userId: string;
    email: string;
    name: string | null;
    role: string;
    kind: "owner" | "member";
}

export interface Invitation {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
    createdAt: string;
}

export type MemberResult<T = { ok: true }> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: "email" };

/**
 * GET a store membership collection, treating a 403/404 as "nothing to show"
 * rather than a failure: these reads are rendered on the team page, and a
 * caller who isn't (or is no longer) an owner/member gets a 403 — historically
 * swallowed to an empty list. A genuine 5xx / network failure still throws so
 * it surfaces via the route error boundary (#101).
 */
async function listMembership<T>(path: string): Promise<T[]> {
    const res = await apiFetch(path);
    if (res.status === 403 || res.status === 404) return [];
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return (await res.json()) as T[];
}

/** The store's team (owners + staff). Empty when none / not permitted. */
export function listMembers(storeId: string): Promise<Member[]> {
    return listMembership<Member>(`/stores/${storeId}/members`);
}

/** Pending invitations for the store. Empty when none / not permitted. */
export function listInvitations(storeId: string): Promise<Invitation[]> {
    return listMembership<Invitation>(`/stores/${storeId}/invitations`);
}

async function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
): Promise<MemberResult> {
    const res = await apiFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.ok) return { ok: true, data: { ok: true } };
    const data = (await res.json().catch(() => null)) as {
        message?: string;
        field?: "email";
    } | null;
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        field: data?.field,
    };
}

export function inviteMember(
    storeId: string,
    email: string,
    role: MemberRole,
): Promise<MemberResult> {
    return mutate(`/stores/${storeId}/invitations`, "POST", { email, role });
}

export function updateMemberRole(
    storeId: string,
    userId: string,
    role: MemberRole,
): Promise<MemberResult> {
    return mutate(`/stores/${storeId}/members/${userId}`, "PATCH", { role });
}

export function removeMember(
    storeId: string,
    userId: string,
): Promise<MemberResult> {
    return mutate(`/stores/${storeId}/members/${userId}`, "DELETE");
}

export function revokeInvitation(
    storeId: string,
    invitationId: string,
): Promise<MemberResult> {
    return mutate(`/stores/${storeId}/invitations/${invitationId}`, "DELETE");
}

/** Accept an invitation by token; returns the store id to redirect into. */
export async function acceptInvitation(
    token: string,
): Promise<{ ok: true; storeId: string } | { ok: false; error: string }> {
    const res = await apiFetch(`/invitations/${token}/accept`, {
        method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
        storeId?: string;
        message?: string;
    } | null;
    if (res.ok && data?.storeId) {
        return { ok: true, storeId: data.storeId };
    }
    return { ok: false, error: data?.message ?? "Could not accept invitation" };
}
