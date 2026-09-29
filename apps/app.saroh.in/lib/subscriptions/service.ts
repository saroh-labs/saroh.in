import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CappedList } from "@/lib/lists/capped";
import { withLive } from "@/lib/lists/capped";

import type {
    AutopayChargeTiming,
    AutopayTimingSettings,
} from "./autopay-timing";
import { autopayTimingSettingsOf } from "./autopay-timing";

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
    /** DRAFT arrives with D5: never sold until it is published. */
    status: "ACTIVE" | "ARCHIVED" | "DRAFT";
    /**
     * When a live plan's unpublished changes were last saved (D5); absent or
     * null when it has none.
     */
    pendingChangedAt?: string | null;
    /** A membership's classes a month. Null: as many as they like. */
    classesPerMonth: number | null;
    /** People on it now — active or paused. */
    subscriberCount: number;
    /** Who pays what: the people on it, by the terms they bought at. */
    byPrice: PlanPriceRow[];
    /** The plan's price as a month's worth ("1000.00" for ₹12,000 a year). */
    monthly: string;
    /** What its running (not paused) members pay in a month, in its currency. */
    monthlyFromMembers: string;
    createdAt: string;
    /**
     * When autopay charges its renewals (D13B); null or absent: the
     * business's setting.
     */
    autopayChargeTiming?: AutopayChargeTiming | null;
}

/** One price people on a plan pay, and how many pay it. */
export interface PlanPriceRow {
    price: string;
    currency: string;
    interval: Interval;
    /** Active or paused, on these terms. */
    count: number;
    /** The terms it sells at now; any other row is an older price. */
    current: boolean;
}

/**
 * How a subscription's autopay stands (D12): on, paused in the customer's
 * UPI app, being set up, or failed. Only Subscription Detail's read has it.
 */
export interface SubscriptionAutopay {
    state: "ON" | "PAUSED" | "PENDING" | "FAILED";
    method: "UPI" | "CARD" | "EMANDATE" | null;
    /** Only what the provider gave as displayable: a masked handle, last four. */
    hint: string | null;
    /** The most one charge may take; null when unknown. */
    limit: string | null;
    currency: string;
    since: string;
    failure:
        "NOT_APPROVED" | "EXPIRED" | "PROVIDER_REFUSED" | "NO_ANSWER" | null;
    /**
     * The ₹1 check the customer's set-up took with nothing owed, and where
     * its automatic refund is (D12B, DEC-064). Never income. Null or
     * absent: none was taken.
     */
    check?: {
        amount: string;
        currency: string;
        state: "REFUNDING" | "REFUNDED" | "NOT_REFUNDED";
        refundedAt: string | null;
    } | null;
}

export interface Subscription {
    id: string;
    status: SubscriptionStatus;
    plan: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    /** Autopay (D12); absent from the list and from an API older than D12. */
    autopay?: SubscriptionAutopay | null;
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
    /** When a pause resumes on its own (D8); null until someone resumes it. */
    pausedUntil: string | null;
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
    /**
     * An autopay charge is under way on one of its unpaid invoices (D13):
     * "Autopay charge in progress · ‹date›", `at` being when the debit is
     * asked for. No Retry and no pay link meanwhile. Only Subscription
     * Detail's read has it; absent from an API older than D13.
     */
    autopayCharge?: { at: string } | null;
    /**
     * How Retry goes now (D13): `MANDATE` charges their autopay again,
     * `PAY_LINK` makes a new pay link. Null: nothing to retry, or a charge
     * is under way. Absent from an API older than D13 (a pay link).
     */
    retryVia?: RetryVia | null;
    /**
     * The autopay card staff manage it from (D14). Only Subscription
     * Detail's read has it; absent from an API older than D14.
     */
    autopayCard?: AutopayCard | null;
    /** Its autopay on the list (D14); only the list has it. */
    autopayOn?: AutopayBadge | null;
}

/** How a failed renewal is retried (D13). */
export type RetryVia = "MANDATE" | "PAY_LINK";

/** A way to pay autopay by, as the business's provider offers it. */
export type AutopayMethod = "UPI" | "CARD" | "EMANDATE";

/** Whether the business offers autopay now, and by what (D14). */
export interface AutopayOffer {
    /**
     * Its provider takes autopay and the rollout flag is on: only then may
     * the workspace offer it or promise it.
     */
    offered: boolean;
    /** Every method its account offers — never narrowed (DEC-059). */
    methods: AutopayMethod[];
    /** The ₹1 check a method takes when nothing is owed (DEC-064). */
    checks: Partial<
        Record<AutopayMethod, { amount: string; currency: string }>
    >;
    /** "Razorpay", when autopay is offered. */
    provider: string | null;
}

/** Subscription Detail's autopay card (D14), beside D12's `autopay` line. */
export interface AutopayCard extends AutopayOffer {
    /** How the current mandate came to be; null without one. */
    setUp: {
        source: "PAY_LINK" | "PRICES" | "ACCOUNT" | "SETUP_LINK" | null;
        at: string;
        /** Who on the team sent the set-up link it came from. */
        sentBy: string | null;
    } | null;
    /** The last mandate was cancelled and nothing replaced it. */
    ended: { at: string; reason: string | null; confirmed: boolean } | null;
    /** D13's "Autopay limit too low", while it holds. */
    limitLow: {
        limit: string | null;
        amount: string;
        currency: string;
        at: string;
    } | null;
    /** Where Saroh would email a set-up link; null: copy it instead. */
    emailTo: string | null;
}

/** A subscription's autopay on the list (D14). */
export interface AutopayBadge {
    method: AutopayMethod | null;
    hint: string | null;
    paused: boolean;
}

/** What "Send a set-up link" made; the link is shown once. */
export interface AutopayLink {
    url: string;
    method: AutopayMethod;
    limit: string;
    currency: string;
    check: { amount: string; currency: string } | null;
    expiresAt: string;
    emailed: { status: "QUEUED" | "SUPPRESSED"; to: string } | null;
    emailProblem: string | null;
}

/** What "Cancel autopay" did (D14). */
export interface AutopayCancelled {
    outcome: "CANCELLED" | "CONFIRMING" | "REFUSED" | "ALREADY_OFF";
    provider: string | null;
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

/** A plan as an event names it (D9). */
export interface SubscriptionEventPlan {
    id: string;
    name: string;
    price: string;
    currency: string;
    interval: Interval;
}

/** One thing done to a subscription, from its log (D9). */
export interface SubscriptionEvent {
    id: string;
    /** SUBSCRIBED, PAUSED, RESUMED, … — the API's SUBSCRIPTION_EVENT_KINDS. */
    kind: string;
    actor: {
        kind: "TEAM" | "CUSTOMER" | "JOB" | "OPERATOR";
        /** Null for Saroh support, the job and a customer. */
        userId: string | null;
        /** A team member's name now, "Saroh support", "Saroh"; else null. */
        name: string | null;
    };
    /** The invoice it issued or acted on; null without `invoice:read`. */
    invoice: { id: string; number: string | null } | null;
    note: string | null;
    /** What the kind needs to be said in words. */
    data: Record<string, unknown>;
    createdAt: string;
}

export interface SubscriptionEventsPage {
    /** Newest first. */
    events: SubscriptionEvent[];
    nextCursor: string | null;
    /** It began before the log was kept: "Earlier changes weren't recorded". */
    earlierUnrecorded: boolean;
}

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
    /** 1–60; null is as many as they like. */
    classesPerMonth?: number | null;
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
 * Its log, newest first, a page at a time (D9). Optional: a failed read is
 * named in the Changes card and costs nothing else on the page.
 */
export async function listSubscriptionEvents(
    id: string,
    cursor?: string,
): Promise<Optional<SubscriptionEventsPage>> {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    return optionalRead((base) =>
        apiFetch(`${base}${sub(id)}/events?${query.toString()}`),
    );
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

/**
 * The plans, as the Plans tab reads them: a failed read is named in the tab
 * and costs nothing else, so the subscriptions still show (D3).
 */
export async function listPlansOptional(): Promise<Optional<Plan[]>> {
    return optionalRead<Plan[]>((base) =>
        apiFetch(`${base}/subscription-plans`),
    );
}

/** One plan, or null when it does not exist (a 403 is `forbidden()`). */
export async function getPlan(id: string): Promise<Plan | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Plan>(`${base}${plan(id)}`);
}

/**
 * The people on one plan (D4): its newest subscriptions and every active or
 * paused one, as the list reads them. Optional: a failed read costs Plan
 * Detail its Subscribers tab and nothing else.
 */
export async function listPlanSubscriptions(
    planId: string,
): Promise<Optional<CappedList<Subscription>>> {
    const base = await orgBase();
    if (!base) return { state: "failed" };
    const q = `${base}/subscriptions?planId=${encodeURIComponent(planId)}`;
    try {
        const reads = await Promise.all(
            [q, `${q}&status=ACTIVE`, `${q}&status=PAUSED`].map((u) =>
                apiFetch(u),
            ),
        );
        if (reads.some((r) => r.status === 403)) return { state: "denied" };
        if (reads.some((r) => !r.ok)) return { state: "failed" };
        const [newest, active, paused] = (await Promise.all(
            reads.map((r) => r.json()),
        )) as Subscription[][];
        return { state: "ok", data: withLive(newest, active, paused) };
    } catch {
        return { state: "failed" };
    }
}

/** A value a plan event records: money as "1500.00", classes as a number. */
export type PlanEventValue = string | number | null;

/** One change to a plan, as the API records it (D2). */
export interface PlanEvent {
    id: string;
    kind:
        | "CREATED"
        | "PUBLISHED"
        | "PRICE_CHANGED"
        | "CLASSES_CHANGED"
        | "RENAMED"
        | "DESCRIPTION_CHANGED"
        | "UPDATED"
        | "ARCHIVED"
        | "RESTORED"
        | "DRAFT_DISCARDED";
    /** `{ field: [before, after] }`, only the fields that changed. */
    changes: Partial<Record<string, [PlanEventValue, PlanEventValue]>>;
    actor: {
        kind: "TEAM" | "JOB" | "OPERATOR";
        userId: string | null;
        /** "Saroh support" for an operator, "Saroh" for the job. */
        name: string | null;
    };
    createdAt: string;
}

export interface PlanEventsPage {
    /** Newest first. */
    events: PlanEvent[];
    /** Ask with this for the next, older page; null at the end. */
    nextCursor: string | null;
    /** The plan is older than its history: "Earlier changes weren't recorded". */
    earlierUnrecorded: boolean;
}

/**
 * A page of a plan's history, newest first. Optional: a failed read is
 * named in the History tab, and the rest of Plan Detail still shows.
 */
export async function listPlanEvents(
    planId: string,
    cursor?: string | null,
): Promise<Optional<PlanEventsPage>> {
    return optionalRead<PlanEventsPage>((base) =>
        apiFetch(
            `${base}${plan(planId)}/events${
                cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
            }`,
        ),
    );
}

export async function getRenewals(): Promise<Renewals | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Renewals>(`${base}/subscriptions/renewals`);
}

/** The business's subscription settings (round-2 A8; D13B). */
export interface SubscriptionSettings {
    /** "Members can pause from their account": on by default. */
    membersCanPause: boolean;
    /** Whether customers have an account on the business's site yet. */
    accountArea: boolean;
    /**
     * "When autopay charges" (D13B). Null from an older API, or when the
     * block is strange: the setting isn't shown.
     */
    autopay: AutopayTimingSettings | null;
}

/**
 * The settings, or null when they couldn't be read (or this role can't):
 * optional, so the Plans tab just goes without the row.
 */
export async function getSubscriptionSettings(): Promise<SubscriptionSettings | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(`${base}/subscriptions/settings`);
        if (!res.ok) return null;
        const body = (await res.json()) as Record<string, unknown>;
        return typeof body.membersCanPause === "boolean" &&
            typeof body.accountArea === "boolean"
            ? {
                  membersCanPause: body.membersCanPause,
                  accountArea: body.accountArea,
                  autopay: autopayTimingSettingsOf(body.autopay),
              }
            : null;
    } catch {
        return null;
    }
}

export function setMembersCanPause(
    on: boolean,
): Promise<ApiResult<SubscriptionSettings>> {
    return send<SubscriptionSettings>(
        "/subscriptions/settings",
        "PATCH",
        { membersCanPause: on },
        "Couldn't save that. Try again.",
    );
}

/** "When autopay charges" for the business (D13B). */
export function setAutopayChargeTiming(
    timing: AutopayChargeTiming,
): Promise<ApiResult<SubscriptionSettings>> {
    return send<SubscriptionSettings>(
        "/subscriptions/settings",
        "PATCH",
        { autopayChargeTiming: timing },
        "Couldn't save when autopay charges. Try again.",
    );
}

/** A plan's own "When autopay charges" (D13B); null: the business's. */
export function setPlanChargeTiming(
    planId: string,
    timing: AutopayChargeTiming | null,
): Promise<ApiResult<Plan>> {
    return send<Plan>(
        `${plan(planId)}/autopay-timing`,
        "PATCH",
        { autopayChargeTiming: timing },
        "Couldn't save when autopay charges for this plan. Try again.",
    );
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
/**
 * How long a pause lasts (D8): 2, 4 or 8 weeks from today, or until a day
 * (YYYY-MM-DD in its zone), or `until: null` until someone resumes it.
 */
export type PauseChoice = { weeks: 2 | 4 | 8 } | { until: string | null };

export function pauseSubscription(id: string, choice: PauseChoice) {
    return send<Subscription>(
        `${sub(id)}/pause`,
        "POST",
        choice,
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
/**
 * Retry a failed renewal (`POST :id/retry`). By pay link (the default): the
 * old link stops, nothing is charged or sent, and the link comes back once
 * for the merchant to copy (Home's "Retry by pay link", F4). By autopay
 * (D13): a new charge on their mandate, with no link (`url` null); `paid`
 * when the provider had already collected it.
 */
export function retrySubscription(id: string, via: RetryVia = "PAY_LINK") {
    return send<{
        invoiceId: string;
        url: string | null;
        via?: RetryVia;
        paid?: boolean;
    }>(
        `${sub(id)}/retry`,
        "POST",
        via === "PAY_LINK" ? {} : { via },
        via === "PAY_LINK"
            ? "Couldn't make a new pay link. Nothing changed."
            : "Autopay wasn't charged. Nothing changed.",
    );
}

/**
 * Whether the business offers autopay now (D14), for the copy that may
 * promise it. Unknown (an older API, a failed read) reads as not offered,
 * so nothing promises what may not be there.
 */
export async function getAutopayOffer(): Promise<AutopayOffer | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(`${base}/subscriptions/autopay`);
        if (!res.ok) return null;
        const body = (await res.json()) as Partial<AutopayOffer>;
        return typeof body.offered === "boolean" && Array.isArray(body.methods)
            ? {
                  offered: body.offered,
                  methods: body.methods,
                  checks: body.checks ?? {},
                  provider: body.provider ?? null,
              }
            : null;
    } catch {
        return null;
    }
}

/**
 * "Send a set-up link" (D14): the provider's page to approve autopay on,
 * for `method`; emailed as well when `email` and the business can.
 */
export function sendAutopayLink(
    id: string,
    method: AutopayMethod,
    email: boolean,
) {
    return send<AutopayLink>(
        `${sub(id)}/autopay/link`,
        "POST",
        { method, email },
        "Couldn't make a set-up link. Nothing was sent.",
    );
}

/** "Cancel autopay" (D14): the provider is asked first. */
export function cancelAutopay(id: string) {
    return send<AutopayCancelled>(
        `${sub(id)}/autopay/cancel`,
        "POST",
        {},
        "Couldn't cancel autopay. Nothing changed — try again.",
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
