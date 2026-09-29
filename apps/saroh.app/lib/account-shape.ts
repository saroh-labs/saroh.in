import type {
    AccountBlock,
    AccountBooking,
    AccountClasses,
    AccountHomeData,
    AccountMessage,
    AccountNote,
    AccountOrder,
    AccountOrderDetail,
    AccountOrderLine,
    AccountOrderVisit,
    AccountPack,
    AccountPlan,
    AccountPlanTab,
    AccountReceipt,
    AccountSubscription,
    AccountTab,
    AccountTabKey,
    AccountThread,
    AccountTrackStep,
    AccountView,
} from "@saroh/site-blocks";
import {
    autopayChecksOf,
    autopayMethodsOf,
    autopayStateOf,
} from "@saroh/site-blocks";

/**
 * The account area's answers, checked before a page sees them (round-2 plan
 * A, A5). The API's allow-list (`site-accounts/customer-view.ts`) decides
 * what is sent; these decide what is read, field by field, so a page never
 * draws a shape it didn't expect. Kept apart from `account-area.ts`, which
 * reads the app's env, so they are tested without one (the checkout-shape
 * pattern).
 */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null =>
    v === null || isString(v);
const isNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

const TAB_KEYS: readonly AccountTabKey[] = [
    "home",
    "bookings",
    "orders",
    "plan",
    "messages",
    "me",
];

function isTab(v: unknown): v is AccountTab {
    return (
        isRecord(v) &&
        (TAB_KEYS as readonly unknown[]).includes(v.key) &&
        isString(v.label)
    );
}

export function isAccountView(v: unknown): v is AccountView {
    if (!isRecord(v) || !isRecord(v.offers)) return false;
    return (
        isNullableString(v.name) &&
        isString(v.email) &&
        isNullableString(v.phone) &&
        isString(v.businessName) &&
        Array.isArray(v.tabs) &&
        v.tabs.every(isTab) &&
        isBoolean(v.offers.appointments) &&
        isBoolean(v.offers.orders) &&
        isBoolean(v.offers.plans) &&
        (v.bookingsLabel === "Bookings" ||
            v.bookingsLabel === "Appointments") &&
        isBoolean(v.healthNotes) &&
        // A13's unread count; an API from before it sends none.
        (v.unreadMessages === undefined || isNumber(v.unreadMessages))
    );
}

function isBooking(v: unknown): v is AccountBooking {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.service) &&
        isString(v.startAt) &&
        isString(v.endAt) &&
        isString(v.timezone) &&
        isNullableString(v.staff) &&
        (v.online === null || isBoolean(v.online))
    );
}

function isOrder(v: unknown): v is AccountOrder {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.number) &&
        isString(v.placedAt) &&
        isString(v.total) &&
        isString(v.currency) &&
        isBoolean(v.open) &&
        isString(v.status) &&
        isString(v.fulfilment) &&
        Array.isArray(v.items) &&
        v.items.every(
            (i) => isRecord(i) && isString(i.name) && isNumber(i.quantity),
        ) &&
        isNumber(v.moreItems)
    );
}

function isPlan(v: unknown): v is AccountPlan {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.name) &&
        isString(v.price) &&
        isString(v.currency) &&
        isString(v.interval) &&
        (v.status === "ACTIVE" || v.status === "PAUSED") &&
        isNullableString(v.renewsAt) &&
        isNullableString(v.pausedUntil) &&
        isNullableString(v.endsAt) &&
        // A8 adds it; an API before A8 leaves it out.
        (v.timezone === undefined || isString(v.timezone))
    );
}

function isClasses(v: unknown): v is AccountClasses {
    if (!isRecord(v) || !Array.isArray(v.packs)) return false;
    const m = v.membership;
    const membershipOk =
        m === null ||
        (isRecord(m) &&
            isString(m.plan) &&
            isNumber(m.perMonth) &&
            isNumber(m.left) &&
            isString(m.resetsAt) &&
            isBoolean(m.paused));
    return (
        membershipOk &&
        v.packs.every(
            (p) =>
                isRecord(p) &&
                isString(p.name) &&
                isNumber(p.credits) &&
                isNumber(p.left) &&
                isString(p.expiresAt),
        )
    );
}

/**
 * A Home block: a read that failed stays failed, and one that came back in
 * a shape we don't know is treated as failed too — never as "none".
 */
function block<T>(
    v: unknown,
    isValue: (value: unknown) => value is T,
): AccountBlock<T> {
    if (isRecord(v) && v.ok === true && isValue(v.value)) {
        return { ok: true, value: v.value };
    }
    return { ok: false };
}

/** A block's value mapped, a failed block kept failed. */
function mapBlock<T, U>(b: AccountBlock<T>, f: (v: T) => U): AccountBlock<U> {
    return b.ok ? { ok: true, value: f(b.value) } : { ok: false };
}

const orNull =
    <T>(is: (v: unknown) => v is T) =>
    (v: unknown): v is T | null =>
        v === null || is(v);

const isOrders = (v: unknown): v is AccountOrder[] =>
    Array.isArray(v) && v.every(isOrder);

export function homeResult(v: unknown): AccountHomeData | null {
    if (!isRecord(v)) return null;
    return {
        nextBooking:
            v.nextBooking === null
                ? null
                : block(v.nextBooking, orNull(isBooking)),
        classes: block(v.classes, orNull(isClasses)),
        orders: v.orders === null ? null : block(v.orders, isOrders),
        plan: block(v.plan, orNull(isPlan)),
    };
}

/** The Orders tab's list (A7), or null when it isn't one. */
export function ordersResult(v: unknown): AccountOrder[] | null {
    return isOrders(v) ? v : null;
}

const VISIT_STATES = ["done", "booked", "missed", "to-book"] as const;
const STEP_STATES = ["done", "now", "next"] as const;
const ORDER_STATES = ["open", "done", "refunded", "cancelled"] as const;

function isVisit(v: unknown): v is AccountOrderVisit {
    return (
        isRecord(v) &&
        isNumber(v.number) &&
        isNullableString(v.startAt) &&
        isNullableString(v.timezone) &&
        (VISIT_STATES as readonly unknown[]).includes(v.state)
    );
}

function isOrderLine(v: unknown): v is AccountOrderLine {
    return (
        isRecord(v) &&
        isString(v.name) &&
        isNumber(v.quantity) &&
        (v.kind === "product" || v.kind === "service") &&
        (v.visits === null ||
            (Array.isArray(v.visits) && v.visits.every(isVisit)))
    );
}

function isStep(v: unknown): v is AccountTrackStep {
    return (
        isRecord(v) &&
        isString(v.label) &&
        (STEP_STATES as readonly unknown[]).includes(v.state) &&
        isString(v.line) &&
        isNullableString(v.at)
    );
}

function isCourier(v: unknown): v is AccountOrderDetail["courier"] {
    return (
        v === null ||
        (isRecord(v) &&
            isNullableString(v.name) &&
            isNullableString(v.trackingNumber) &&
            isNullableString(v.trackingUrl))
    );
}

/** One order's Track (A7), or null when it isn't one. */
export function orderDetailResult(v: unknown): AccountOrderDetail | null {
    if (!isRecord(v)) return null;
    const ok =
        isString(v.ref) &&
        isString(v.number) &&
        isString(v.placedAt) &&
        isString(v.total) &&
        isString(v.currency) &&
        isString(v.fulfilment) &&
        (ORDER_STATES as readonly unknown[]).includes(v.state) &&
        isString(v.status) &&
        Array.isArray(v.lines) &&
        v.lines.every(isOrderLine) &&
        Array.isArray(v.steps) &&
        v.steps.every(isStep) &&
        isCourier(v.courier) &&
        isNullableString(v.refund) &&
        isNullableString(v.receipt);
    return ok ? (v as unknown as AccountOrderDetail) : null;
}

function isReceipt(v: unknown): v is AccountReceipt {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.number) &&
        isNullableString(v.issuedAt) &&
        isNullableString(v.paidAt) &&
        isString(v.total) &&
        isString(v.currency) &&
        (v.billOfSupply === undefined || typeof v.billOfSupply === "boolean")
    );
}

export function receiptsResult(v: unknown): AccountReceipt[] | null {
    return Array.isArray(v) && v.every(isReceipt) ? v : null;
}

export function isNote(v: unknown): v is AccountNote {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.text) &&
        isString(v.sentAt) &&
        (v.state === "SENT" || v.state === "ON_RECORD")
    );
}

export function notesResult(v: unknown): AccountNote[] | null {
    return Array.isArray(v) && v.every(isNote) ? v : null;
}

// ---- The Plan tab (A8) ------------------------------------------------------

function isSubscription(v: unknown): v is AccountSubscription {
    if (!isPlan(v)) return false;
    const r = v as unknown as Rec;
    const c = r.classes;
    const p = r.payNow;
    return (
        (c === null ||
            (isRecord(c) &&
                isNumber(c.perMonth) &&
                isNumber(c.left) &&
                isString(c.resetsAt))) &&
        (p === null ||
            (isRecord(p) &&
                isString(p.total) &&
                isString(p.currency) &&
                isNullableString(p.dueAt))) &&
        isBoolean(r.canPause) &&
        isBoolean(r.canResume) &&
        isBoolean(r.canCancel)
    );
}

function isPack(v: unknown): v is AccountPack {
    return (
        isRecord(v) &&
        isString(v.name) &&
        isNumber(v.credits) &&
        isNumber(v.left) &&
        isString(v.expiresAt) &&
        isBoolean(v.live)
    );
}

/**
 * The Plan tab, or null when it came back in a shape we don't know. Each
 * part that failed, or came back strange, stays "couldn't be loaded".
 */
export function planTabResult(v: unknown): AccountPlanTab | null {
    if (!isRecord(v) || !Array.isArray(v.pauseWeeks)) return null;
    if (!v.pauseWeeks.every(isNumber)) return null;
    return {
        subscriptions: mapBlock(
            block(
                v.subscriptions,
                (x): x is AccountSubscription[] =>
                    Array.isArray(x) && x.every(isSubscription),
            ),
            (rows) => rows.map(withAutopay),
        ),
        packs: block(
            v.packs,
            (x): x is AccountPack[] => Array.isArray(x) && x.every(isPack),
        ),
        pauseWeeks: v.pauseWeeks,
        // Autopay (D12): the provider's own list; none from an older API.
        autopayMethods: autopayMethodsOf(v.autopayMethods),
        // The ₹1 check each takes with nothing owed (D12B); none from an
        // older API.
        autopayChecks: autopayChecksOf(v.autopayChecks),
    };
}

/** A plan's autopay fields, checked: anything strange reads as none (D12). */
function withAutopay(s: AccountSubscription): AccountSubscription {
    const r = s as unknown as Rec;
    const pays = r.autopayPays;
    return {
        ...s,
        autopay: autopayStateOf(r.autopay),
        autopayPays:
            isRecord(pays) && isString(pays.total) && isString(pays.currency)
                ? { total: pays.total, currency: pays.currency }
                : null,
    };
}

/** What a pause, resume or cancel answered: the message and the tab now. */
export function planChangeAnswer(
    status: number,
    body: unknown,
    fallback: string,
):
    | { ok: true; message: string; tab: AccountPlanTab }
    | { ok: false; message: string } {
    if (status === 200 && isRecord(body) && isString(body.message)) {
        const tab = planTabResult(body.tab);
        if (tab) return { ok: true, message: body.message, tab };
    }
    return { ok: false, message: planRefusal(status, body, fallback) };
}

/** What "Pay now" answered: the new link to send the member to. */
export function payNowAnswer(
    status: number,
    body: unknown,
    fallback: string,
): { ok: true; url: string } | { ok: false; message: string } {
    if (status === 200 && isRecord(body) && isString(body.url)) {
        try {
            const url = new URL(body.url);
            // Only ever a pay page: never somewhere else the API was told.
            if (
                (url.protocol === "https:" || url.protocol === "http:") &&
                url.pathname.startsWith("/pay/")
            ) {
                return { ok: true, url: url.toString() };
            }
        } catch {
            // Not a URL: refused below.
        }
    }
    return { ok: false, message: planRefusal(status, body, fallback) };
}

/**
 * The account's plan refusals are written for the member (409 and 403 from
 * `account-plan.service.ts`), so they are passed on; a 404 is the plan no
 * longer being theirs to change; anything else is the page's own sentence.
 */
function planRefusal(status: number, body: unknown, fallback: string): string {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    if (
        (status === 409 || status === 403) &&
        isString(error?.message) &&
        error.message.trim()
    ) {
        return error.message;
    }
    if (status === 404) {
        return "That plan isn't on your account any more. Refresh the page.";
    }
    return refusalMessage(status, body, fallback);
}

// ---- Messages (A13) ---------------------------------------------------------

export function isMessage(v: unknown): v is AccountMessage {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        (v.from === "me" || v.from === "business") &&
        isString(v.text) &&
        isString(v.sentAt)
    );
}

/** The customer's thread (A13), or null when it came back in a shape we don't know. */
export function threadResult(v: unknown): AccountThread | null {
    if (!isRecord(v) || !Array.isArray(v.messages)) return null;
    if (!v.messages.every(isMessage) || !isBoolean(v.earlier)) return null;
    return { messages: v.messages, earlier: v.earlier };
}

/**
 * What `POST me/email` answered, for the sign-in sheet in its email-change
 * role. 200 is the same neutral answer whatever happened; the new email is
 * read back from the session afterwards.
 */
export type EmailChangeAnswer =
    | { ok: true }
    | { ok: false; reason: "invalid" | "expired" | "closed" | "error" }
    | { ok: false; reason: "limit"; retryAfterSeconds: number };

export function emailChangeAnswer(
    status: number,
    body: unknown,
): EmailChangeAnswer {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const details = error && isRecord(error.details) ? error.details : {};
    if (status === 200) return { ok: true };
    if (status === 400) {
        return {
            ok: false,
            reason: details.reason === "invalid" ? "invalid" : "expired",
        };
    }
    if (status === 429) {
        const retry = details.retryAfter;
        return {
            ok: false,
            reason: "limit",
            retryAfterSeconds:
                isNumber(retry) && retry > 0 ? Math.ceil(retry) : 60,
        };
    }
    if (status === 403) return { ok: false, reason: "closed" };
    return { ok: false, reason: "error" };
}

/**
 * What to tell the customer when the API refused a change. Only a 400's
 * field messages (the DTO's, written for the customer: "Enter a phone
 * number, like +91 98765 43210"), and the account area's own 409 and 429
 * (A13's "Wait a minute, then try again") are passed on; anything else is
 * the page's own sentence.
 */
export function refusalMessage(
    status: number,
    body: unknown,
    fallback: string,
): string {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    if (status === 400 && Array.isArray(error?.details)) {
        const first: unknown = error.details[0];
        if (isString(first) && first.trim()) return first;
    }
    if (
        (status === 409 || status === 429) &&
        isString(error?.message) &&
        error.message.trim()
    ) {
        return error.message;
    }
    return fallback;
}
