import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";

/**
 * Plans and the people on them (ADR-007), through the org-nested
 * `/subscription-plans` and `/subscriptions` routes. Server-only.
 */

export type Interval = "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export type SubscriptionStatus = "ACTIVE" | "PAUSED" | "CANCELLED";

export interface Plan {
    id: string;
    name: string;
    description: string | null;
    price: string;
    currency: string;
    interval: Interval;
    status: "ACTIVE" | "ARCHIVED";
    /** People on it now — active or paused. */
    subscriberCount: number;
    createdAt: string;
}

export interface Subscription {
    id: string;
    status: SubscriptionStatus;
    plan: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    price: string;
    currency: string;
    interval: Interval;
    timezone: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextRenewalAt: string | null;
    endsAt: string | null;
    pausedAt: string | null;
    cancelledAt: string | null;
    overdue: boolean;
    overdueCount: number;
    unpaidCount: number;
    unpaidTotal: string;
    oldestUnpaid: {
        id: string;
        number: string | null;
        dueAt: string | null;
    } | null;
    latestInvoice: {
        id: string;
        number: string | null;
        status: "ISSUED" | "PAID";
        dueAt: string | null;
        paidAt: string | null;
    } | null;
    startedAt: string;
    createdAt: string;
}

export interface Renewals {
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    issuedToday: number;
}

export interface PlanInput {
    name?: string;
    description?: string | null;
    price?: string;
    currency?: string;
    interval?: Interval;
}

export interface SubscribeInput {
    contactId: string;
    planId: string;
    /** YYYY-MM-DD, in the subscription's timezone. */
    startDate?: string;
    timezone?: string;
}

export async function listSubscriptions(): Promise<Subscription[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Subscription[]>(`${base}/subscriptions`)) ?? [];
}

export async function listPlans(): Promise<Plan[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Plan[]>(`${base}/subscription-plans`)) ?? [];
}

export async function getRenewals(): Promise<Renewals | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Renewals>(`${base}/subscriptions/renewals`);
}

async function send<T>(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, fallback);
}

const sub = (id: string) => `/subscriptions/${encodeURIComponent(id)}`;
const plan = (id: string) => `/subscription-plans/${encodeURIComponent(id)}`;

export function subscribe(input: SubscribeInput) {
    return send<Subscription>(
        "/subscriptions",
        "POST",
        input,
        "Could not subscribe them.",
    );
}
export function pauseSubscription(id: string) {
    return send<Subscription>(
        `${sub(id)}/pause`,
        "POST",
        {},
        "Could not pause that.",
    );
}
export function resumeSubscription(id: string) {
    return send<Subscription>(
        `${sub(id)}/resume`,
        "POST",
        {},
        "Could not resume that.",
    );
}
export function cancelSubscription(id: string, when: "now" | "periodEnd") {
    return send<Subscription>(
        `${sub(id)}/cancel`,
        "POST",
        { when },
        "Could not cancel that.",
    );
}
export function keepSubscription(id: string) {
    return send<Subscription>(
        `${sub(id)}/keep`,
        "POST",
        {},
        "Could not keep that going.",
    );
}
export function createPlan(input: PlanInput) {
    return send<Plan>(
        "/subscription-plans",
        "POST",
        input,
        "Could not save that plan.",
    );
}
export function updatePlan(id: string, input: PlanInput) {
    return send<Plan>(plan(id), "PATCH", input, "Could not save that plan.");
}
export function setPlanArchived(id: string, archived: boolean) {
    return send<Plan>(
        `${plan(id)}/${archived ? "archive" : "restore"}`,
        "POST",
        {},
        archived
            ? "Could not archive that plan."
            : "Could not restore that plan.",
    );
}
