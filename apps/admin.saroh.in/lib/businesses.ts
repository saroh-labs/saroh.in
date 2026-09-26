import { cookies } from "next/headers";

import { adminFetch, getJson } from "./control-plane";

/**
 * Businesses on the instance, as the console reads them (plan U3–U5).
 * Server-only: every read forwards the operator's session to the API, which
 * decides what they may see.
 */

export type LifecycleStatus =
    "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED_RETAINED";

export type AttentionReason = "PAST_DUE" | "FAILED_JOBS" | "FAILED_WEBHOOKS";

export interface BusinessRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus: LifecycleStatus;
    createdAt: string;
    members: number;
    enabledModules: string[];
    plan: { key: string; name: string } | null;
    subscriptionStatus: string | null;
    lastActiveAt: string | null;
    attention: AttentionReason[];
}

export interface BusinessPage {
    items: BusinessRow[];
    nextCursor?: string;
}

export interface BusinessQuery {
    q?: string;
    lifecycle?: string;
    plan?: string;
    module?: string;
    health?: string;
    cursor?: string;
}

export type Panel<T> = { status: "ok"; data: T } | { status: "failed" };

export interface BusinessView {
    facts: {
        id: string;
        name: string;
        slug: string;
        createdAt: string;
        lifecycleStatus: LifecycleStatus;
        suspendedAt: string | null;
        suspensionReason: string | null;
        deletionScheduledAt: string | null;
        deletionReason: string | null;
        timezone: string | null;
        country: string | null;
        counts: {
            members: number;
            sites: number;
            orders: number;
            openOrders: number;
            bookings: number;
            contacts: number;
        };
    };
    people: Panel<{
        members: {
            membershipId: string;
            userId: string;
            name: string | null;
            email: string | null;
            emailVerified: boolean;
            role: string;
        }[];
        invitations: {
            id: string;
            email: string | null;
            role: string;
            status: string;
            expiresAt: string;
            createdAt: string;
        }[];
    }>;
    modules: Panel<
        {
            key: string;
            label: string;
            status: "ENABLED" | "DISABLED" | "ARCHIVED" | "NOT_INSTALLED";
            dependencies: string[];
        }[]
    >;
    plan: Panel<{
        subscription: {
            status: string;
            plan: { id: string; key: string; name: string; version: number };
            currentPeriodEnd: string | null;
            cancelAtPeriodEnd: boolean;
        } | null;
        limits: {
            key: string;
            planValue: number | boolean | null;
            effective: number | boolean | null;
            usage: number | null;
            override: { id: string; value: number; expiresAt: string } | null;
        }[];
    }>;
    activity: Panel<
        {
            id: string;
            action: string;
            actorUserId: string;
            actor: string | null;
            targetType: string | null;
            outcome: string;
            createdAt: string;
        }[]
    >;
    operatorActions: Panel<
        {
            id: string;
            action: string;
            actorUserId: string;
            actor: string | null;
            reason: string | null;
            outcome: string;
            createdAt: string;
        }[]
    >;
    notes: Panel<
        {
            id: string;
            authorUserId: string;
            author: string | null;
            body: string;
            createdAt: string;
        }[]
    >;
}

export interface PlanOption {
    id: string;
    key: string;
    name: string;
    version: number;
    priceCents: number;
    currency: string;
    interval: string;
}

export function listBusinesses(
    query: BusinessQuery,
): Promise<BusinessPage | null> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query) as [
        string,
        string | undefined,
    ][]) {
        if (value) search.set(key, value);
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return getJson<BusinessPage>(`/organizations${suffix}`);
}

export function getBusinessSummary(id: string): Promise<BusinessRow | null> {
    return getJson<BusinessRow>(
        `/organizations/${encodeURIComponent(id)}/summary`,
    );
}

export function listPlans(): Promise<PlanOption[] | null> {
    return getJson<PlanOption[]>("/plans");
}

/**
 * The name of the cookie holding this operator's support-access session for
 * one business. httpOnly and scoped to the console: the session id never
 * reaches page script, and each business has its own.
 */
export function accessCookieName(organizationId: string): string {
    return `console_access_${organizationId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export type BusinessViewResult =
    | { status: "ok"; view: BusinessView; sessionId: string }
    /** No open session, or the one we held has closed or expired. */
    | { status: "needs-access" }
    | { status: "not-found" };

/**
 * The business page's read. It needs an open support-access session; without
 * one — or once it has lapsed — the screen asks for a reason and opens one.
 */
export async function getBusinessView(
    organizationId: string,
): Promise<BusinessViewResult> {
    const sessionId = (await cookies()).get(
        accessCookieName(organizationId),
    )?.value;
    if (!sessionId) return { status: "needs-access" };

    const res = await adminFetch(
        `/organizations/${encodeURIComponent(organizationId)}`,
        { headers: { "x-admin-access-session": sessionId } },
    );
    if (res.status === 401 || res.status === 403) {
        return { status: "needs-access" };
    }
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) {
        throw new Error(`GET /admin/organizations/:id failed: ${res.status}`);
    }
    return {
        status: "ok",
        view: (await res.json()) as BusinessView,
        sessionId,
    };
}
