import type {
    Optional,
    Plan,
    Renewals,
    Subscription,
    SubscriptionCharge,
    SubscriptionEventsPage,
} from "./service";

/**
 * What Subscriptions' read routes may send the browser (DEC-259): only the
 * fields the screens draw, named here. Whatever else the API answers (a
 * provider's customer, subscription, mandate or payment id, a token) stays
 * on the server, so it never reaches route JSON or the query cache. A
 * subtree passed whole (`ANY`: GST figures, an event's words) still loses
 * any key that names a provider's reference.
 */

type Shape = typeof ANY | { readonly [key: string]: Shape } | readonly [Shape];

const ANY = true as const;

/** Keys that hold a provider's reference or a secret, at any depth. */
const SECRET =
    /mandate|token|secret|password|razorpay|stripe|provider\w*id|providerRef|customerId|paymentId|signature|vpa|cardNumber/i;

function scrub(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(scrub);
    if (value === null || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        if (!SECRET.test(k)) out[k] = scrub(v);
    }
    return out;
}

function pick(value: unknown, shape: Shape): unknown {
    if (shape === ANY) return scrub(value);
    if (value === null || value === undefined) return value;
    if (Array.isArray(shape)) {
        return Array.isArray(value)
            ? value.map((v) => pick(v, shape[0] as Shape))
            : undefined;
    }
    if (typeof value !== "object" || Array.isArray(value)) return undefined;
    const from = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(shape as Record<string, Shape>)) {
        if (k in from) out[k] = pick(from[k], s);
    }
    return out;
}

const GST = ANY;
const INVOICE_REF = { id: ANY, number: ANY } as const;
const OFFER = { offered: ANY, methods: ANY, checks: ANY, provider: ANY };

const SUBSCRIPTION = {
    id: ANY,
    status: ANY,
    plan: { id: ANY, name: ANY },
    contact: { id: ANY, name: ANY, email: ANY },
    autopay: {
        state: ANY,
        method: ANY,
        hint: ANY,
        limit: ANY,
        currency: ANY,
        since: ANY,
        failure: ANY,
        check: { amount: ANY, currency: ANY, state: ANY, refundedAt: ANY },
    },
    price: ANY,
    pay: ANY,
    gst: GST,
    currency: ANY,
    interval: ANY,
    timezone: ANY,
    currentPeriodStart: ANY,
    currentPeriodEnd: ANY,
    nextRenewalAt: ANY,
    startsAt: ANY,
    endsAt: ANY,
    pausedAt: ANY,
    pausedUntil: ANY,
    cancelledAt: ANY,
    overdue: ANY,
    overdueCount: ANY,
    unpaidCount: ANY,
    unpaidTotal: ANY,
    oldestUnpaid: { ...INVOICE_REF, dueAt: ANY },
    latestInvoice: {
        ...INVOICE_REF,
        status: ANY,
        dueAt: ANY,
        paidAt: ANY,
    },
    paymentFailed: ANY,
    failedCharge: { ...INVOICE_REF, dueAt: ANY, total: ANY },
    collection: {
        weekday: ANY,
        note: ANY,
        upcoming: [{ date: ANY, skipped: ANY, changeable: ANY }],
    },
    pendingPlan: {
        id: ANY,
        name: ANY,
        price: ANY,
        pay: ANY,
        gst: GST,
        currency: ANY,
        interval: ANY,
        from: ANY,
    },
    startedAt: ANY,
    createdAt: ANY,
    autopayCharge: { at: ANY },
    retryVia: ANY,
    autopayCard: {
        ...OFFER,
        setUp: { source: ANY, at: ANY, sentBy: ANY },
        ended: { at: ANY, reason: ANY, confirmed: ANY },
        limitLow: { limit: ANY, amount: ANY, currency: ANY, at: ANY },
        emailTo: ANY,
    },
    autopayOn: { method: ANY, hint: ANY, paused: ANY },
} as const;

const PLAN = {
    id: ANY,
    name: ANY,
    description: ANY,
    price: ANY,
    currency: ANY,
    interval: ANY,
    status: ANY,
    pendingChangedAt: ANY,
    classesPerMonth: ANY,
    subscriberCount: ANY,
    byPrice: [
        {
            price: ANY,
            pay: ANY,
            currency: ANY,
            interval: ANY,
            count: ANY,
            current: ANY,
        },
    ],
    monthly: ANY,
    monthlyFromMembers: ANY,
    createdAt: ANY,
    autopayChargeTiming: ANY,
    gstRate: ANY,
    sacCode: ANY,
    gstPriceMode: ANY,
    gst: GST,
} as const;

const CHARGE = {
    id: ANY,
    number: ANY,
    status: ANY,
    standing: ANY,
    kind: ANY,
    total: ANY,
    currency: ANY,
    issuedAt: ANY,
    dueAt: ANY,
    paidAt: ANY,
    periodStart: ANY,
    periodEnd: ANY,
    payment: { method: ANY },
    gst: GST,
    issuedAutomatically: ANY,
    createdAt: ANY,
} as const;

const EVENTS = {
    events: [
        {
            id: ANY,
            kind: ANY,
            actor: { kind: ANY, userId: ANY, name: ANY },
            invoice: INVOICE_REF,
            note: ANY,
            // Free words for the log; a mandate's id in it is scrubbed.
            data: ANY,
            createdAt: ANY,
        },
    ],
    nextCursor: ANY,
    earlierUnrecorded: ANY,
} as const;

const RENEWALS = { lastCheckedAt: ANY, nextCheckAt: ANY, issuedToday: ANY };

export const renewalsWire = (r: Renewals | null) =>
    pick(r, RENEWALS) as Renewals | null;
export const subscriptionWire = (s: Subscription) =>
    pick(s, SUBSCRIPTION) as Subscription;
export const planWire = (p: Plan) => pick(p, PLAN) as Plan;
export const chargeWire = (c: SubscriptionCharge) =>
    pick(c, CHARGE) as SubscriptionCharge;
export const eventsWire = (page: SubscriptionEventsPage) =>
    pick(page, EVENTS) as SubscriptionEventsPage;

/** An optional read's data, projected; a refusal or failure as it was. */
export function optionalWire<T>(read: Optional<T>, wire: (t: T) => T) {
    return read.state === "ok"
        ? { state: "ok" as const, data: wire(read.data) }
        : read;
}
