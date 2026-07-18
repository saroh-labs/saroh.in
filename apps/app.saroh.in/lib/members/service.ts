import { headers } from "next/headers";

import { env } from "@/env";

/**
 * Members + invitations data access for app.saroh.in. Like the stores client,
 * the app never touches the DB — every call forwards the session cookie to
 * api.saroh.in, which enforces owner-only management and the email-match rule
 * on accept. Server-only: imports next/headers.
 */

const API_URL =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

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

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

/** The store's team (owners + staff). Empty on any failure. */
export async function listMembers(storeId: string): Promise<Member[]> {
    const res = await apiFetch(`/stores/${storeId}/members`);
    if (!res.ok) return [];
    return (await res.json()) as Member[];
}

/** Pending invitations for the store. Empty on any failure. */
export async function listInvitations(storeId: string): Promise<Invitation[]> {
    const res = await apiFetch(`/stores/${storeId}/invitations`);
    if (!res.ok) return [];
    return (await res.json()) as Invitation[];
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
