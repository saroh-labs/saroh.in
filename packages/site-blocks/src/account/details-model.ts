import { dateIn } from "../booking-flow/model";
import { timeWords } from "../lib/clock";
import type {
    AccountChange,
    AccountCourse,
    AccountInvoiceDue,
    AccountWaitlistPlace,
} from "./details-types";
import { accountDate, accountMoney, bookingWhen } from "./model";

/**
 * The rest of what a customer sees in their account (DEC-142): invoices
 * still to pay, places in a class's line, courses, whether the business may
 * email them, and what changed since they were last here. The same shapes
 * the API's allow-list (`site-accounts/account-details-view.ts`) sends; the
 * site's server checks every answer against them first
 * (`saroh.app/lib/account-details-shape`). Plain data and pure words only:
 * nothing here calls anything. The shapes themselves are in
 * `details-types.ts`, which Home's own shape (`model.ts`) reads too.
 */

export type {
    AccountChange,
    AccountCourse,
    AccountInvoiceDue,
    AccountNotices,
    AccountWaitlistPlace,
} from "./details-types";

// ---- Where things live ------------------------------------------------------

/** An order's own page, so an email can link straight to it. */
export function orderHref(ref: string): string {
    return `/account/orders/${encodeURIComponent(ref)}`;
}

/** A booking's own page. */
export function bookingHref(ref: string): string {
    return `/account/bookings/${encodeURIComponent(ref)}`;
}

/** Where the invoices to pay are listed: on Your details, above Receipts. */
export const TO_PAY_ID = "to-pay";
export const TO_PAY_HREF = `/account/me#${TO_PAY_ID}`;

/**
 * The booking page opened on a class's day, where a place held for them is
 * booked through the normal path (A12).
 */
export function placeHref(place: AccountWaitlistPlace): string {
    const query = new URLSearchParams({ service: place.serviceRef });
    try {
        query.set("date", dateIn(place.startAt, place.timezone));
    } catch {
        // An unknown zone: the class's page, without the day.
    }
    return `/book?${query.toString()}`;
}

// ---- Words ------------------------------------------------------------------

/** "Invoice INV-0042 · ₹2,500". */
export function invoiceTitle(invoice: AccountInvoiceDue): string {
    const name = invoice.billOfSupply ? "Bill of supply" : "Invoice";
    return `${[name, invoice.number].filter(Boolean).join(" ")} · ${accountMoney(invoice.total, invoice.currency)}`;
}

/** "Unlimited, October · Due 8 Oct 2026", and how to pay when not online. */
export function invoiceLine(
    invoice: AccountInvoiceDue,
    businessName: string,
): string {
    const name = businessName.trim() || "the business";
    return [
        invoice.what,
        invoice.dueAt
            ? `${invoice.overdue ? "Was due" : "Due"} ${accountDate(invoice.dueAt)}`
            : invoice.issuedAt
              ? `Sent ${accountDate(invoice.issuedAt)}`
              : null,
        invoice.pay === "charging"
            ? "Autopay charge in progress"
            : invoice.pay === "direct"
              ? `Pay ${name} directly`
              : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

/** "Overdue" or "To pay": the row's tag. */
export function invoiceTag(invoice: AccountInvoiceDue): string {
    return invoice.overdue ? "Overdue" : "To pay";
}

/** "Morning flow · Wed 14 Oct, 9:00 am". */
export function placeTitle(place: AccountWaitlistPlace): string {
    return `${place.service} · ${bookingWhen(place.startAt, place.timezone)}`;
}

/**
 * "Held for you until 11:30 am", with the day when that isn't today, or
 * where they stand in line.
 */
export function placeLine(place: AccountWaitlistPlace, now: Date): string {
    if (place.status === "OFFERED") {
        const until = place.offeredUntil;
        if (!until) return "A place is held for you";
        return `A place is held for you until ${untilWords(until, place.timezone, now)}`;
    }
    const n = place.placeInLine ?? 1;
    return n <= 1
        ? "You're next in line"
        : `${n - 1} ${n - 1 === 1 ? "person is" : "people are"} ahead of you`;
}

/** "11:30 am" today, else "Wed 14 Oct, 11:30 am". */
function untilWords(iso: string, timeZone: string, now: Date): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    try {
        const sameDay =
            dateIn(iso, timeZone) === dateIn(now.toISOString(), timeZone);
        return sameDay ? timeWords(at, timeZone) : bookingWhen(iso, timeZone);
    } catch {
        return bookingWhen(iso, "UTC");
    }
}

/** "5 Oct to 26 Oct 2026", or the one day, or nothing for a course with no dates. */
export function courseDates(course: AccountCourse): string {
    const first = accountDate(course.firstAt, course.timezone);
    const last = accountDate(course.lastAt, course.timezone);
    if (!first || !last) return first || last;
    if (first === last) return first;
    // The year once, when both days fall in it.
    const year = last.slice(-5);
    return first.endsWith(year)
        ? `${first.slice(0, -5)} to ${last}`
        : `${first} to ${last}`;
}

/** "4 sessions · 1 attended · 1 missed · 2 to come". */
export function courseLine(course: AccountCourse): string {
    const n = course.sessions;
    return [
        `${n} ${n === 1 ? "session" : "sessions"}`,
        course.attended > 0 ? `${course.attended} attended` : null,
        course.missed > 0 ? `${course.missed} missed` : null,
        `${course.left} to come`,
    ]
        .filter(Boolean)
        .join(" · ");
}

/** "Next: Mon 19 Oct, 10:00 am", or that it has finished. */
export function courseNext(course: AccountCourse): string {
    if (course.nextAt) {
        return `Next: ${bookingWhen(course.nextAt, course.timezone)}`;
    }
    return course.sessions > 0 ? "Finished" : "";
}

/**
 * One change in the customer's words, and where it leads. `messages` is
 * the account's Messages tab, or null when this business has none. The
 * business is named, never the person on its team.
 */
export function changeWords(
    change: AccountChange,
    businessName: string,
    messagesHref: string | null,
): { text: string; href: string | null } {
    const name = businessName.trim() || "The business";
    switch (change.kind) {
        case "order":
            return {
                text: `Order #${change.number}: ${change.status}`,
                href: orderHref(change.ref),
            };
        case "booking-moved":
            return {
                text: `${name} moved ${change.service} to ${bookingWhen(change.startAt, change.timezone)}`,
                href: bookingHref(change.ref),
            };
        case "booking-cancelled":
            return {
                text: `${name} cancelled ${change.service} on ${bookingWhen(change.startAt, change.timezone)}`,
                href: bookingHref(change.ref),
            };
        case "messages":
            return {
                text:
                    change.count === 1
                        ? `A new message from ${name}`
                        : `${change.count} new messages from ${name}`,
                href: messagesHref,
            };
        case "invoice":
            return {
                text: `${[`An invoice to pay`, change.number].filter(Boolean).join(": ")} · ${accountMoney(change.total, change.currency)}`,
                href: TO_PAY_HREF,
            };
    }
}

/**
 * When a change happened, for its row: "Today", "Yesterday", else "9 Oct"
 * (the year too when it isn't this one), as the day falls in `timeZone`.
 */
export function changeWhen(iso: string, now: Date, timeZone = "UTC"): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const day = (d: Date) => {
        try {
            return dateIn(d.toISOString(), timeZone);
        } catch {
            return d.toISOString().slice(0, 10);
        }
    };
    if (day(at) === day(now)) return "Today";
    if (day(at) === day(new Date(now.getTime() - 86_400_000))) {
        return "Yesterday";
    }
    const full = accountDate(iso, timeZone);
    return full.endsWith(String(now.getUTCFullYear()))
        ? full.slice(0, -5)
        : full;
}
