import { headers } from "next/headers";

import { env } from "@/env";

/**
 * Data access for the Saroh control plane (`/admin/*` on api.saroh.in).
 *
 * Admin talks to the API over HTTP like every other frontend — it never imports
 * @saroh/database. The session cookie is forwarded so the API's
 * `PlatformAdminGuard` decides whether the caller is staff; this app never
 * decides that for itself. Server-only (imports next/headers).
 */
const API_URL =
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

export interface PlatformMetrics {
    organizations: { total: number; createdLast30Days: number };
    users: { total: number; verified: number; createdLast30Days: number };
    moduleAdoption: { moduleKey: string; organizations: number }[];
    commerce: { orders: number; openOrders: number };
    content: { sites: number; publishedSites: number };
    activity: { type: string; events: number }[];
}

export interface AdminFlag {
    key: string;
    /** `null` = never configured, which is NOT the same as disabled. */
    enabledByDefault: boolean | null;
    overrides: {
        organizationId: string;
        organizationName: string;
        enabled: boolean;
    }[];
}

export interface AdminOrganization {
    id: string;
    name: string;
    slug: string;
}

export interface FlagChange {
    id: string;
    organizationId: string | null;
    previousValue: boolean | null;
    newValue: boolean;
    actorUserId: string;
    reason: string | null;
    createdAt: string;
}

export interface AdminAuditEvent {
    id: string;
    actorUserId: string;
    permission: string;
    action: string;
    targetType: string;
    targetId: string | null;
    organizationId: string | null;
    reason: string | null;
    outcome: "SUCCESS" | "FAILURE" | "DENIED";
    correlationId: string | null;
    createdAt: string;
}

export interface AdminAuditPage {
    items: AdminAuditEvent[];
    nextCursor?: string;
}

export interface AdminAuditQuery {
    cursor?: string;
    limit?: number;
    actorUserId?: string;
    organizationId?: string;
    action?: string;
}

export interface StaffIdentity {
    userId: string;
    email: string;
    roles: AdminRole[];
    permissions: AdminPermission[];
    /** Access came from ADMIN_ALLOWLIST config rather than a recorded grant. */
    viaBootstrap: boolean;
}

export type AdminRole =
    | "PLATFORM_OWNER"
    | "SUPPORT"
    | "OPERATIONS"
    | "BILLING"
    | "RELEASE_MANAGER"
    | "AUDITOR";

export type AdminPermission =
    | "platform:read"
    | "organization:read"
    | "organization:pii:read"
    | "organization:people:write"
    | "organization:modules:write"
    | "organization:lifecycle:write"
    | "organization:view-as"
    | "jobs:read"
    | "jobs:retry"
    | "webhooks:read"
    | "webhooks:replay"
    | "providers:read"
    | "providers:recheck"
    | "incidents:read"
    | "incidents:write"
    | "subscription:read"
    | "subscription:override"
    | "flags:read"
    | "flags:publish"
    | "staff:read"
    | "staff:grant"
    | "audit:read";

export type ControlPlaneResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    return fetch(`${API_URL}/admin${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

/** Read a control-plane resource. `null` when the caller is not staff (403). */
async function getJson<T>(path: string): Promise<T | null> {
    const res = await adminFetch(path);
    // 401/403 is a legitimate "you are not staff", not an outage — the caller
    // renders the not-authorized state. Anything else is a real failure and
    // throws, so an API outage never masquerades as "access denied".
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) {
        throw new Error(`GET /admin${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
}

/**
 * Whether the API considers the caller staff. This — not the local
 * ADMIN_ALLOWLIST — is the authoritative gate: the allowlist only ever guarded
 * this app's own pages, while the data lives behind the API's guard.
 */
export function getStaffIdentity(): Promise<StaffIdentity | null> {
    return getJson<StaffIdentity>("/me");
}

export function getMetrics(): Promise<PlatformMetrics | null> {
    return getJson<PlatformMetrics>("/metrics");
}

export function listFlags(): Promise<AdminFlag[] | null> {
    return getJson<AdminFlag[]>("/flags");
}

export function listOrganizations(): Promise<AdminOrganization[] | null> {
    return getJson<AdminOrganization[]>("/organizations");
}

export function flagHistory(flagKey: string): Promise<FlagChange[] | null> {
    return getJson<FlagChange[]>(
        `/flags/${encodeURIComponent(flagKey)}/history`,
    );
}

export function listAudit(
    query: AdminAuditQuery = {},
): Promise<AdminAuditPage | null> {
    const search = new URLSearchParams();
    if (query.cursor) search.set("cursor", query.cursor);
    if (query.limit) search.set("limit", String(query.limit));
    if (query.actorUserId) search.set("actorUserId", query.actorUserId);
    if (query.organizationId) {
        search.set("organizationId", query.organizationId);
    }
    if (query.action) search.set("action", query.action);
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson<AdminAuditPage>(`/audit${suffix}`);
}

/** Extract the API's error-envelope message so operators see the real reason. */
async function readError(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; details?: unknown };
        message?: string;
    } | null;
    const details = body?.error?.details;
    if (Array.isArray(details) && typeof details[0] === "string") {
        return details[0];
    }
    return body?.error?.message ?? body?.message ?? fallback;
}

export async function setGlobalFlag(
    flagKey: string,
    enabled: boolean,
    reason: string,
    idempotencyKey: string,
): Promise<ControlPlaneResult<null>> {
    const res = await adminFetch(`/flags/${encodeURIComponent(flagKey)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled, reason, idempotencyKey }),
    });
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(res, "Could not set flag."),
        };
    }
    return { ok: true, data: null };
}

export async function setFlagOverride(
    flagKey: string,
    organizationId: string,
    enabled: boolean,
    reason: string,
    idempotencyKey: string,
): Promise<ControlPlaneResult<null>> {
    const res = await adminFetch(
        `/flags/${encodeURIComponent(flagKey)}/organizations/${encodeURIComponent(organizationId)}`,
        {
            method: "PUT",
            body: JSON.stringify({ enabled, reason, idempotencyKey }),
        },
    );
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(res, "Could not set the override."),
        };
    }
    return { ok: true, data: null };
}

export async function clearFlagOverride(
    flagKey: string,
    organizationId: string,
    reason: string,
    idempotencyKey: string,
): Promise<ControlPlaneResult<null>> {
    const res = await adminFetch(
        `/flags/${encodeURIComponent(flagKey)}/organizations/${encodeURIComponent(organizationId)}`,
        {
            method: "DELETE",
            body: JSON.stringify({ reason, idempotencyKey }),
        },
    );
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(res, "Could not clear the override."),
        };
    }
    return { ok: true, data: null };
}
