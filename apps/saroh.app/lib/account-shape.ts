import type {
    AccountBlock,
    AccountBooking,
    AccountClasses,
    AccountHomeData,
    AccountNote,
    AccountOrder,
    AccountOrderDetail,
    AccountOrderLine,
    AccountOrderVisit,
    AccountPlan,
    AccountReceipt,
    AccountTab,
    AccountTabKey,
    AccountTrackStep,
    AccountView,
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
        isBoolean(v.healthNotes)
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
        isNullableString(v.endsAt)
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
        isString(v.currency)
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
 * number, like +91 98765 43210") and the account area's own 409 are passed
 * on; anything else is the page's own sentence.
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
    if (status === 409 && isString(error?.message) && error.message.trim()) {
        return error.message;
    }
    return fallback;
}
