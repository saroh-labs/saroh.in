import { accountMoney, bookingWhen } from "./model";

/**
 * The account's Bookings, as the site's server hands them to the page
 * (round-2 plan A, A6): the same shapes the API's allow-list
 * (`site-accounts/account-bookings-view.ts`) sends, checked field by field
 * on the site's server first (`saroh.app/lib/account-bookings-shape.ts`).
 * Plain data and pure words only: nothing here calls anything.
 */

export type AccountBookingState =
    "booked" | "attended" | "missed" | "cancelled";

export interface AccountCancelTerms {
    late: boolean;
    freeUntil: string | null;
    money: "refund" | "kept-late" | "kept-policy" | "order" | "none";
    credit: "back" | "kept" | null;
}

export interface AccountBookingRow {
    ref: string;
    service: string;
    serviceRef: string;
    startAt: string;
    endAt: string;
    timezone: string;
    staff: string | null;
    online: boolean | null;
    state: AccountBookingState;
    kind: "one" | "class";
    visit: { number: number; of: number } | null;
    cancelledLate: boolean;
    move: "sheet" | "page" | "call" | null;
    cancel: AccountCancelTerms | null;
}

export interface AccountTreatmentVisit {
    number: number;
    ref: string | null;
    startAt: string | null;
    timezone: string | null;
    staff: string | null;
    online: boolean | null;
    state: "done" | "booked" | "missed" | "to-book";
}

export interface AccountTreatment {
    ref: string;
    name: string;
    total: string;
    currency: string;
    paid: boolean;
    visits: AccountTreatmentVisit[];
    done: number;
    bookNext: number | null;
}

export interface AccountBookings {
    comingUp: AccountBookingRow[];
    past: AccountBookingRow[];
    cancelled: AccountBookingRow[];
    treatments: AccountTreatment[];
}

export interface AccountTimes {
    service: string;
    staff: string | null;
    timezone: string;
    times: string[];
}

export interface AccountCancelResult {
    booking: AccountBookingRow;
    refund: {
        amount: string;
        currency: string;
        status: "SENT" | "CONFIRMING" | "REFUSED";
    } | null;
    kept: { amount: string; currency: string } | null;
    order: boolean;
    /**
     * The business is told (A14): the cancel happened now and its notice to
     * the team is queued. Absent from an API before A14, read as false.
     */
    told?: boolean;
}

export const BOOKINGS_HREF = "/account/bookings";

/** Where a class is moved: the booking page, on that class. */
export function moveClassHref(ref: string): string {
    return `/book?move=${encodeURIComponent(ref)}`;
}

// ---- Words ------------------------------------------------------------------

const STATE_TAG: Record<AccountBookingState, string> = {
    booked: "Booked",
    attended: "Attended",
    missed: "Missed",
    cancelled: "Cancelled",
};

/** "Check-up · Mon 5 Oct, 10:00". */
export function bookingTitle(row: AccountBookingRow): string {
    return `${row.service} · ${bookingWhen(row.startAt, row.timezone)}`;
}

/** "Visit 2 of 3 · With Dr. Rao · Video call · Cancelled late". */
export function bookingSub(row: AccountBookingRow): string {
    return [
        row.visit ? `Visit ${row.visit.number} of ${row.visit.of}` : null,
        row.staff ? `With ${row.staff}` : null,
        row.online === true ? "Video call" : null,
        row.cancelledLate ? "Cancelled late" : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

export function bookingTag(row: AccountBookingRow): string {
    return STATE_TAG[row.state];
}

/**
 * What the cancel sheet says will happen, from the terms the API worked
 * out: the free-cancel deadline, then the money, then a class credit.
 */
export function cancelNote(
    terms: AccountCancelTerms,
    timezone: string,
): string {
    const parts: string[] = [];
    if (terms.late) {
        parts.push(
            terms.freeUntil
                ? `It's past the free-cancellation time (${bookingWhen(terms.freeUntil, timezone)}).`
                : "It's past the free-cancellation time.",
        );
    } else if (terms.freeUntil) {
        parts.push(
            `Free to cancel until ${bookingWhen(terms.freeUntil, timezone)}.`,
        );
    } else {
        parts.push("Free to cancel.");
    }
    const money: Record<AccountCancelTerms["money"], string | null> = {
        refund: "What you paid online is refunded.",
        "kept-late": "What you paid online is kept.",
        "kept-policy": "What you paid online isn't refunded automatically.",
        order: "Money for this treatment is refunded from its order.",
        none: null,
    };
    const said = money[terms.money];
    if (said) parts.push(said);
    if (terms.credit === "back") parts.push("Your class credit goes back.");
    if (terms.credit === "kept") parts.push("The class counts as used.");
    return parts.join(" ");
}

/** What the page says once a cancel has gone through. */
export function cancelledText(result: AccountCancelResult): string {
    // "The team has been told" only when it is (A14).
    const parts = result.told
        ? ["Cancelled. The team has been told."]
        : ["Cancelled."];
    const { refund, kept } = result;
    if (refund) {
        const amount = accountMoney(refund.amount, refund.currency);
        parts.push(
            refund.status === "REFUSED"
                ? `The refund of ${amount} didn't go through. Contact the business about it.`
                : `${amount} is being refunded to the way you paid.`,
        );
    } else if (kept) {
        parts.push(
            `The ${accountMoney(kept.amount, kept.currency)} you paid online is kept.`,
        );
    }
    return parts.join(" ");
}

/**
 * What a move says it did: "Moved to Tue 6 Oct at 11:00." and, once the
 * business really is told of it (A14), "‹Business› has been told."
 */
export function movedText(
    label: string,
    businessName: string,
    told: boolean,
): string {
    const name = businessName.trim();
    return told
        ? `Moved to ${label}. ${name || "The team"} has been told.`
        : `Moved to ${label}.`;
}

/** "Mon 5 Oct at 10:00", a free time in the sheet. */
export function timeLabel(iso: string, timezone: string): string {
    return bookingWhen(iso, timezone).replace(", ", " at ");
}

const VISIT_TAG: Record<AccountTreatmentVisit["state"], string> = {
    done: "Done",
    booked: "Booked",
    missed: "Missed",
    "to-book": "To book",
};

/** The same calendar day in `timezone`. */
function sameDay(a: Date, b: Date, timezone: string): boolean {
    try {
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
        return day.format(a) === day.format(b);
    } catch {
        return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
    }
}

/** A treatment visit's title, line and tag (the design's clinic card). */
export function treatmentVisitWords(
    visit: AccountTreatmentVisit,
    treatment: AccountTreatment,
    now: Date,
): { title: string; sub: string; tag: string; today: boolean } {
    const when =
        visit.startAt && visit.timezone
            ? ` · ${bookingWhen(visit.startAt, visit.timezone)}`
            : "";
    const today =
        visit.state === "booked" &&
        visit.startAt !== null &&
        sameDay(new Date(visit.startAt), now, visit.timezone ?? "UTC");
    const waiting = treatment.visits.some((v) => v.state === "booked");
    const sub =
        visit.state === "to-book"
            ? treatment.bookNext === visit.number
                ? "Ready to book."
                : waiting
                  ? "We'll plan this one with you at your next visit."
                  : "Booked after the one before."
            : [
                  visit.staff ? `With ${visit.staff}` : null,
                  visit.online === true ? "Video call" : null,
              ]
                  .filter(Boolean)
                  .join(" · ");
    return {
        title: `Visit ${visit.number}${when}`,
        sub,
        tag: today ? "Today" : VISIT_TAG[visit.state],
        today,
    };
}

/** "1 of 3 visits done". */
export function treatmentSub(treatment: AccountTreatment): string {
    const n = treatment.visits.length;
    return `${treatment.done} of ${n} ${n === 1 ? "visit" : "visits"} done`;
}

/** "Paid ₹9,000 for the whole treatment. …", while visits are left. */
export function treatmentLead(treatment: AccountTreatment): string | null {
    if (treatment.visits.length <= 1) return null;
    if (treatment.done >= treatment.visits.length) return null;
    const price = accountMoney(treatment.total, treatment.currency);
    return `${treatment.paid ? `Paid ${price}` : price} for the whole treatment. Each visit is booked when the one before is done.`;
}
