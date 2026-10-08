import type {
    AccountBookingRow,
    AccountBookings,
    AccountCancelResult,
    AccountCancelTerms,
    AccountTimes,
    AccountTreatment,
    AccountTreatmentVisit,
} from "@saroh/site-blocks";

/**
 * The account's Bookings answers, checked before a page sees them (round-2
 * plan A, A6): the API's allow-list (`site-accounts/account-bookings-view.ts`)
 * decides what is sent; these decide what is read, field by field, so a page
 * never draws a shape it didn't expect. Kept apart from `account-area.ts`,
 * which reads the app's env, so they are tested without one.
 */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null =>
    v === null || isString(v);
const isNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf =
    <T extends string>(values: readonly T[]) =>
    (v: unknown): v is T =>
        (values as readonly unknown[]).includes(v);

const isState = oneOf(["booked", "attended", "missed", "cancelled"] as const);
const isKind = oneOf(["one", "class"] as const);
const isMove = oneOf(["sheet", "page", "call"] as const);
const isMoney = oneOf([
    "refund",
    "kept-late",
    "kept-policy",
    "order",
    "none",
] as const);
const isVisitState = oneOf(["done", "booked", "missed", "to-book"] as const);
const isRefundStatus = oneOf(["SENT", "CONFIRMING", "REFUSED"] as const);
const isPaidHow = oneOf([
    "online",
    "desk",
    "both",
    "pack",
    "membership",
] as const);

/** What was paid for a booking (UX-049); absent from an older API. */
function isPaid(v: unknown): boolean {
    return (
        v === undefined ||
        v === null ||
        (isRecord(v) &&
            isPaidHow(v.how) &&
            isNullableString(v.amount) &&
            isNullableString(v.currency))
    );
}

function isTerms(v: unknown): v is AccountCancelTerms {
    return (
        isRecord(v) &&
        isBoolean(v.late) &&
        isNullableString(v.freeUntil) &&
        isMoney(v.money) &&
        (v.credit === null || v.credit === "back" || v.credit === "kept")
    );
}

export function isBookingRow(v: unknown): v is AccountBookingRow {
    if (!isRecord(v)) return false;
    const visit = v.visit;
    return (
        isString(v.ref) &&
        isString(v.service) &&
        isString(v.serviceRef) &&
        isString(v.startAt) &&
        isString(v.endAt) &&
        isString(v.timezone) &&
        isNullableString(v.staff) &&
        (v.online === null || isBoolean(v.online)) &&
        isState(v.state) &&
        isKind(v.kind) &&
        (visit === null ||
            (isRecord(visit) &&
                isNumber(visit.number) &&
                isNumber(visit.of))) &&
        isBoolean(v.cancelledLate) &&
        (v.move === null || isMove(v.move)) &&
        (v.cancel === null || isTerms(v.cancel)) &&
        isPaid(v.paid)
    );
}

function isVisit(v: unknown): v is AccountTreatmentVisit {
    return (
        isRecord(v) &&
        isNumber(v.number) &&
        isNullableString(v.ref) &&
        isNullableString(v.startAt) &&
        isNullableString(v.timezone) &&
        isNullableString(v.staff) &&
        (v.online === null || isBoolean(v.online)) &&
        isVisitState(v.state)
    );
}

export function isTreatment(v: unknown): v is AccountTreatment {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.name) &&
        isString(v.total) &&
        isString(v.currency) &&
        isBoolean(v.paid) &&
        Array.isArray(v.visits) &&
        v.visits.every(isVisit) &&
        isNumber(v.done) &&
        (v.bookNext === null || isNumber(v.bookNext))
    );
}

const rows = (v: unknown): v is AccountBookingRow[] =>
    Array.isArray(v) && v.every(isBookingRow);

/** The Bookings tab's lists, or null when they aren't them. */
export function bookingsResult(v: unknown): AccountBookings | null {
    if (!isRecord(v)) return null;
    const ok =
        rows(v.comingUp) &&
        rows(v.past) &&
        rows(v.cancelled) &&
        Array.isArray(v.treatments) &&
        v.treatments.every(isTreatment);
    return ok ? (v as unknown as AccountBookings) : null;
}

/** Free times for a sheet, or null. */
export function timesResult(v: unknown): AccountTimes | null {
    const ok =
        isRecord(v) &&
        isString(v.service) &&
        isNullableString(v.staff) &&
        isString(v.timezone) &&
        Array.isArray(v.times) &&
        v.times.every(isString);
    return ok ? (v as unknown as AccountTimes) : null;
}

function isAmount(v: unknown): v is { amount: string; currency: string } {
    return isRecord(v) && isString(v.amount) && isString(v.currency);
}

/** What a cancel did, or null. */
export function cancelResult(v: unknown): AccountCancelResult | null {
    if (!isRecord(v)) return null;
    const refund = v.refund;
    const ok =
        isBookingRow(v.booking) &&
        (refund === null ||
            (isAmount(refund) && isRefundStatus((refund as Rec).status))) &&
        (v.kept === null || isAmount(v.kept)) &&
        isBoolean(v.order) &&
        // Served from A14 on; an API before it has none.
        (v.told === undefined || isBoolean(v.told));
    return ok ? (v as unknown as AccountCancelResult) : null;
}
