import type {
    AccountBlock,
    AccountChange,
    AccountCourse,
    AccountHomeData,
    AccountInvoiceDue,
    AccountNotices,
    AccountWaitlistPlace,
} from "@saroh/site-blocks";

/**
 * The account's newer answers, checked before a page sees them (DEC-142):
 * invoices to pay, places in a class's line, courses, the email choice and
 * what changed since the last visit. The API's allow-list
 * (`site-accounts/account-details-view.ts`) decides what is sent; these
 * decide what is read, field by field, as `account-shape.ts` does for the
 * rest. Pure, so they are tested without an env.
 */

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null =>
    v === null || isString(v);
const isCount = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0;
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
/** An instant the page can draw: an ISO date that parses. */
const isInstant = (v: unknown): v is string =>
    isString(v) && !Number.isNaN(Date.parse(v));
const isNullableInstant = (v: unknown): v is string | null =>
    v === null || isInstant(v);

const PAY = ["online", "charging", "direct"] as const;

export function isInvoiceDue(v: unknown): v is AccountInvoiceDue {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.number) &&
        isNullableString(v.what) &&
        isNullableInstant(v.issuedAt) &&
        isNullableInstant(v.dueAt) &&
        isBoolean(v.overdue) &&
        isString(v.total) &&
        isString(v.currency) &&
        isBoolean(v.billOfSupply) &&
        (PAY as readonly unknown[]).includes(v.pay)
    );
}

export function isWaitlistPlace(v: unknown): v is AccountWaitlistPlace {
    return (
        isRecord(v) &&
        isString(v.service) &&
        isString(v.serviceRef) &&
        isInstant(v.startAt) &&
        isString(v.timezone) &&
        (v.status === "WAITING" || v.status === "OFFERED") &&
        (v.placeInLine === null || isCount(v.placeInLine)) &&
        isNullableInstant(v.offeredUntil)
    );
}

export function isCourse(v: unknown): v is AccountCourse {
    return (
        isRecord(v) &&
        isString(v.ref) &&
        isString(v.name) &&
        isNullableInstant(v.firstAt) &&
        isNullableInstant(v.lastAt) &&
        isString(v.timezone) &&
        isCount(v.sessions) &&
        isCount(v.attended) &&
        isCount(v.missed) &&
        isCount(v.left) &&
        isNullableInstant(v.nextAt)
    );
}

export function isChange(v: unknown): v is AccountChange {
    if (!isRecord(v) || !isInstant(v.at)) return false;
    switch (v.kind) {
        case "order":
            return isString(v.ref) && isString(v.number) && isString(v.status);
        case "booking-moved":
        case "booking-cancelled":
            return (
                isString(v.ref) &&
                isString(v.service) &&
                isInstant(v.startAt) &&
                isString(v.timezone)
            );
        case "messages":
            return isCount(v.count) && v.count > 0;
        case "invoice":
            return (
                isString(v.ref) &&
                isString(v.number) &&
                isString(v.total) &&
                isString(v.currency)
            );
        default:
            return false;
    }
}

const listOf =
    <T>(is: (v: unknown) => v is T) =>
    (v: unknown): v is T[] =>
        Array.isArray(v) && v.every(is);

/** A list the API answered with, or null when it isn't one. */
export const invoicesDueResult = (v: unknown): AccountInvoiceDue[] | null =>
    listOf(isInvoiceDue)(v) ? v : null;
export const waitlistResult = (v: unknown): AccountWaitlistPlace[] | null =>
    listOf(isWaitlistPlace)(v) ? v : null;
export const coursesResult = (v: unknown): AccountCourse[] | null =>
    listOf(isCourse)(v) ? v : null;

export function noticesResult(v: unknown): AccountNotices | null {
    return isRecord(v) && isBoolean(v.email) ? { email: v.email } : null;
}

/**
 * A block Home may carry: one that failed, or came back in a shape we
 * don't know, stays failed — never "none". One the API didn't send at all
 * (an API from before DEC-142) is left out, and Home draws nothing for it.
 */
function optionalBlock<T>(
    v: unknown,
    isValue: (value: unknown) => value is T,
): AccountBlock<T> | undefined {
    if (v === undefined) return undefined;
    return isRecord(v) && v.ok === true && isValue(v.value)
        ? { ok: true, value: v.value }
        : { ok: false };
}

/** What DEC-142 added to Home, checked. */
export function homeDetails(
    v: Record<string, unknown>,
): Pick<
    AccountHomeData,
    "changes" | "since" | "invoicesDue" | "waitlist" | "courses" | "linkPending"
> {
    return {
        changes: optionalBlock(v.changes, listOf(isChange)),
        since: isNullableInstant(v.since) ? v.since : null,
        invoicesDue: optionalBlock(v.invoicesDue, listOf(isInvoiceDue)),
        // Null: the business takes no bookings, so there is no line.
        waitlist:
            v.waitlist === null
                ? null
                : optionalBlock(v.waitlist, listOf(isWaitlistPlace)),
        courses: optionalBlock(v.courses, listOf(isCourse)),
        // Only an explicit yes: anything else says nothing.
        linkPending: v.linkPending === true,
    };
}
