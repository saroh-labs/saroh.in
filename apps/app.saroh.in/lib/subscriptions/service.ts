import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CappedList } from "@/lib/lists/capped";
import { withLive } from "@/lib/lists/capped";

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
    /** A start still ahead: nothing is billed until then. */
    startsAt: string | null;
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
    /**
     * Payment failed: the latest charge is unpaid and past due (U7). Derived
     * by the API, never stored; absent from an API older than U7.
     */
    paymentFailed?: boolean;
    /** That charge — null without `invoice:read`. */
    failedCharge?: {
        id: string;
        number: string | null;
        dueAt: string | null;
        total: string;
    } | null;
    /** What is collected, and when; null when nothing is. */
    collection?: {
        /** ISO weekday: 1 Monday … 7 Sunday, in the subscription's timezone. */
        weekday: number;
        note: string | null;
        upcoming: UpcomingCollection[];
    } | null;
    /** A plan change booked for the next renewal. */
    pendingPlan?: {
        id: string;
        name: string;
        price: string;
        currency: string;
        interval: Interval;
        from: string;
    } | null;
    startedAt: string;
    createdAt: string;
}

export interface UpcomingCollection {
    /** Its local date, YYYY-MM-DD. */
    date: string;
    skipped: boolean;
    /** Still to come after today: it may be skipped or brought back. */
    changeable: boolean;
}

/**
 * One charge on a subscription: an invoice it issued, as its charges list
 * needs it. A narrow read of the invoice list, so this screen does not lean
 * on the invoice screens' own types.
 */
export interface SubscriptionCharge {
    id: string;
    number: string | null;
    status: "DRAFT" | "ISSUED" | "PAID" | "VOID";
    standing: "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID" | "CREDITED";
    /** INVOICE | CREDIT_NOTE | SUPPLEMENTARY (ADR-008). */
    kind?: string;
    total: string;
    currency: string;
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    payment: { method: string } | null;
    /** A tax invoice's GST; null on a receipt. */
    gst?: unknown;
    issuedAutomatically: boolean;
    createdAt: string;
}

/** A read that may be withheld from a role, or fail, on its own. */
export type Optional<T> =
    { state: "ok"; data: T } | { state: "denied" } | { state: "failed" };

/** The person on it, from the customer read: how to reach them, and allergies. */
export interface SubscriberCard {
    phone: string | null;
    allergens: string[];
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

/** The newest subscriptions, and every active or paused one (see `withLive`). */
export async function listSubscriptions(): Promise<CappedList<Subscription>> {
    const base = await orgBase();
    if (!base) return { rows: [], truncated: false };
    const [newest, active, paused] = await Promise.all([
        getJson<Subscription[]>(`${base}/subscriptions`),
        getJson<Subscription[]>(`${base}/subscriptions?status=ACTIVE`),
        getJson<Subscription[]>(`${base}/subscriptions?status=PAUSED`),
    ]);
    return withLive(newest ?? [], active ?? [], paused ?? []);
}

/** One subscription, or null when it does not exist (a 403 is `forbidden()`). */
export async function getSubscription(
    id: string,
): Promise<Subscription | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Subscription>(`${base}${sub(id)}`);
}

/**
 * Its charges, newest first. Optional: a role that reads subscriptions but
 * not invoices is told so, and a failed read is named — neither blanks the
 * page, and neither reads as "no charges".
 */
export async function listCharges(
    id: string,
): Promise<Optional<SubscriptionCharge[]>> {
    return optionalRead(async (base) => {
        const res = await apiFetch(
            `${base}/invoices?subscriptionId=${encodeURIComponent(id)}`,
        );
        return res;
    });
}

/**
 * Every invoice a subscription issued, grouped by subscription — what the
 * list's quick look shows as its last charges. One read for the whole list.
 */
export async function listChargesBySubscription(): Promise<
    Optional<Record<string, SubscriptionCharge[]>>
> {
    const res = await optionalRead<
        (SubscriptionCharge & {
            subscriptionId: string | null;
        })[]
    >((base) => apiFetch(`${base}/invoices`));
    if (res.state !== "ok") return res;
    // A plain object, not a Map: it crosses to the client as props.
    const by: Record<string, SubscriptionCharge[]> = {};
    for (const inv of res.data) {
        if (!inv.subscriptionId) continue;
        (by[inv.subscriptionId] ??= []).push(inv);
    }
    return { state: "ok", data: by };
}

/**
 * The subscriber's phone and the allergens their notes name (U8's customer
 * read). Optional and quiet: the card falls back to the email it has.
 */
export async function getSubscriberCard(
    contactId: string,
): Promise<SubscriberCard | null> {
    const res = await optionalRead<{
        contact: { phone: string | null };
        allergens: { name: string }[] | null;
    }>((base) =>
        apiFetch(`${base}/customers/${encodeURIComponent(contactId)}/detail`),
    );
    if (res.state !== "ok") return null;
    return {
        phone: res.data.contact.phone,
        allergens: (res.data.allergens ?? []).map((a) => a.name),
    };
}

async function optionalRead<T>(
    go: (base: string) => Promise<Response>,
): Promise<Optional<T>> {
    const base = await orgBase();
    if (!base) return { state: "failed" };
    try {
        const res = await go(base);
        if (res.status === 403) return { state: "denied" };
        if (!res.ok) return { state: "failed" };
        return { state: "ok", data: (await res.json()) as T };
    } catch {
        return { state: "failed" };
    }
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
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
/** Skip one collection still to come; Undo is {@link unskipCollection}. */
export function skipCollection(id: string, date: string) {
    return send<Subscription>(
        `${sub(id)}/skips`,
        "POST",
        { date },
        "Could not skip that collection.",
    );
}
export function unskipCollection(id: string, date: string) {
    return send<Subscription>(
        `${sub(id)}/skips/${encodeURIComponent(date)}`,
        "DELETE",
        undefined,
        "Could not bring that collection back.",
    );
}
/** Move to another plan from the next renewal; Undo is {@link cancelPlanChange}. */
export function changePlan(id: string, planId: string) {
    return send<Subscription>(
        `${sub(id)}/plan-change`,
        "POST",
        { planId },
        "Could not change the plan.",
    );
}
export function cancelPlanChange(id: string) {
    return send<Subscription>(
        `${sub(id)}/plan-change`,
        "DELETE",
        undefined,
        "Could not keep the current plan.",
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
