import { toMoneyString } from "../../common/money";
import { isPastDue } from "../invoices/invoice-state";
import { isBillOfSupply } from "../invoices/invoice-title";

/**
 * The rest of what a signed-in customer may see of their own record
 * (DEC-142; ADR-011): invoices still to pay, places in a class's line,
 * courses, whether the business may email them, and what changed since
 * they were last here. The third allow-list file, re-exported by
 * `customer-view.ts` so a reviewer still reads one place to know what can
 * leave the account routes. Every answer is built here from named fields,
 * never by spreading a row.
 *
 * Never here: staff notes, who moved or cancelled something (only that the
 * business did), another person in a class or its line, payment references,
 * a pay link's token, or internal ids beyond a row's own opaque `ref` (a
 * service's id is public: the booking page links by it).
 */

// ---- Invoices to pay --------------------------------------------------------

/**
 * How an open invoice can be paid now: through a pay link made when they
 * press "Pay now" ("online"), not while an autopay charge is under way on
 * it ("charging", D13), or only with the business directly ("direct":
 * Payments is off or no provider is connected).
 */
export type AccountInvoicePay = "online" | "charging" | "direct";

export interface AccountInvoiceDue {
    ref: string;
    number: string;
    /** What it bills: the paper's first line, as the customer's copy prints it. */
    what: string | null;
    issuedAt: string | null;
    dueAt: string | null;
    /** Past its due date (`isPastDue`). */
    overdue: boolean;
    total: string;
    currency: string;
    /** A registered business's exempt paper (D15), as the pay page says. */
    billOfSupply: boolean;
    pay: AccountInvoicePay;
}

export function invoiceDueView(
    row: {
        id: string;
        number: string | null;
        status: string;
        issuedAt: Date | null;
        dueAt: Date | null;
        total: { toString(): string };
        currency: string;
        kind: string;
        sellerGstin: string | null;
        lines: {
            description: string;
            gstRate: { toString(): string } | null;
        }[];
    },
    pay: AccountInvoicePay,
    now: Date,
): AccountInvoiceDue {
    const what = row.lines.length > 0 ? row.lines[0].description.trim() : "";
    return {
        ref: row.id,
        number: row.number ?? "",
        what: what === "" ? null : what,
        issuedAt: row.issuedAt?.toISOString() ?? null,
        dueAt: row.dueAt?.toISOString() ?? null,
        overdue: isPastDue(row, now),
        total: toMoneyString(row.total),
        currency: row.currency,
        billOfSupply: isBillOfSupply(row),
        pay,
    };
}

// ---- A class's line ---------------------------------------------------------

/** One of the customer's places in line for a full class (A12). */
export interface AccountWaitlistPlace {
    /** The class, by the name the business shows. */
    service: string;
    /** The service's id, for the booking page and for leaving the line. */
    serviceRef: string;
    startAt: string;
    /** The zone the business keeps its hours in. */
    timezone: string;
    status: "WAITING" | "OFFERED";
    /** 1 is next. Null once a place is held for them. */
    placeInLine: number | null;
    /** While OFFERED: until when the place is held for them. */
    offeredUntil: string | null;
}

export function waitlistPlaceView(
    row: {
        startAt: Date;
        status: string;
        offeredUntil: Date | null;
        service: { id: string; name: string };
    },
    /** How many are waiting ahead of them. */
    ahead: number,
    timezone: string,
    now: Date,
): AccountWaitlistPlace {
    // A held place that ran out is back in line until the sweep says so,
    // as the booking page reads it (`waitlist.service.ts` `placeView`).
    const offered =
        row.status === "OFFERED" &&
        row.offeredUntil !== null &&
        row.offeredUntil > now;
    return {
        service: row.service.name,
        serviceRef: row.service.id,
        startAt: row.startAt.toISOString(),
        timezone,
        status: offered ? "OFFERED" : "WAITING",
        placeInLine: offered ? null : Math.max(0, Math.trunc(ahead)) + 1,
        offeredUntil: offered
            ? (row.offeredUntil?.toISOString() ?? null)
            : null,
    };
}

// ---- Courses ----------------------------------------------------------------

/** A course the customer holds a seat on, read-only (ADR-007). */
export interface AccountCourse {
    ref: string;
    name: string;
    /** Its first and last session; null for a course with none. */
    firstAt: string | null;
    lastAt: string | null;
    timezone: string;
    /** Their own sessions: every one booked for the seat. */
    sessions: number;
    /** Marked attended by the business. */
    attended: number;
    /** Marked missed by the business. */
    missed: number;
    /** Still to come. */
    left: number;
    /** Their next session, or null when none is left. */
    nextAt: string | null;
}

export function courseView(
    row: {
        id: string;
        course: {
            name: string;
            sessions: { startAt: Date }[];
        };
        /** The seat's own bookings (`courseEnrollmentId`). */
        bookings: {
            startAt: Date;
            status: string;
            outcome: string | null;
        }[];
    },
    timezone: string,
    now: Date,
): AccountCourse {
    const own = row.bookings
        .filter((b) => b.status === "CONFIRMED")
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const dates = row.course.sessions
        .map((s) => s.startAt.getTime())
        .sort((a, b) => a - b);
    const toCome = own.filter((b) => b.startAt.getTime() > now.getTime());
    return {
        ref: row.id,
        name: row.course.name,
        firstAt:
            dates.length > 0 ? new Date(dates[0] ?? 0).toISOString() : null,
        lastAt:
            dates.length > 0
                ? new Date(dates[dates.length - 1] ?? 0).toISOString()
                : null,
        timezone,
        sessions: own.length,
        attended: own.filter((b) => b.outcome === "ATTENDED").length,
        missed: own.filter((b) => b.outcome === "NO_SHOW").length,
        left: toCome.length,
        nextAt: toCome[0]?.startAt.toISOString() ?? null,
    };
}

// ---- Whether the business may email them ------------------------------------

/**
 * The customer's own choice about email from the business: the consent the
 * team already keeps per contact and channel (`Consent`, EMAIL), which every
 * send checks. No row means nobody has said no. Sign-in codes are Saroh's
 * identity mail and are not the business's to stop (ADR-011).
 */
export interface AccountNotices {
    email: boolean;
}

export function noticesView(
    consent: { status: string } | null,
): AccountNotices {
    return { email: consent?.status !== "REVOKED" };
}

// ---- What changed since they were last here ----------------------------------

/**
 * One thing that happened to the customer's own record while they were
 * away: plain facts the page words, never who on the team did it or why.
 */
export type AccountChange =
    | {
          kind: "order";
          /** The order's ref, for its page. */
          ref: string;
          number: string;
          /** Where it is now, as its row says ("Ready", "Cancelled"). */
          status: string;
          at: string;
      }
    | {
          kind: "booking-moved" | "booking-cancelled";
          ref: string;
          service: string;
          /** When it is now (moved), or when it was (cancelled). */
          startAt: string;
          timezone: string;
          at: string;
      }
    | {
          kind: "messages";
          /** Messages the team wrote that they haven't opened. */
          count: number;
          at: string;
      }
    | {
          kind: "invoice";
          ref: string;
          number: string;
          total: string;
          currency: string;
          at: string;
      };

/** How many changes Home lists, newest first. */
export const CHANGE_ROWS = 6;

export function orderChangeView(row: {
    orderRef: string;
    number: string;
    status: string;
    at: Date;
}): AccountChange {
    return {
        kind: "order",
        ref: row.orderRef,
        number: row.number,
        status: row.status,
        at: row.at.toISOString(),
    };
}

export function bookingChangeView(row: {
    type: string;
    at: Date;
    /** Where a cancelled booking was: the slot its event carries. */
    fromStartAt: Date | null;
    booking: {
        id: string;
        startAt: Date;
        timezone: string;
        service: { name: string };
    };
}): AccountChange {
    const cancelled = row.type === "CANCELLED";
    return {
        kind: cancelled ? "booking-cancelled" : "booking-moved",
        ref: row.booking.id,
        service: row.booking.service.name,
        startAt: (cancelled
            ? (row.fromStartAt ?? row.booking.startAt)
            : row.booking.startAt
        ).toISOString(),
        timezone: row.booking.timezone,
        at: row.at.toISOString(),
    };
}

export function messagesChangeView(count: number, at: Date): AccountChange {
    return {
        kind: "messages",
        count: Math.max(1, Math.trunc(count)),
        at: at.toISOString(),
    };
}

export function invoiceChangeView(row: {
    id: string;
    number: string | null;
    total: { toString(): string };
    currency: string;
    issuedAt: Date | null;
    createdAt: Date;
}): AccountChange {
    return {
        kind: "invoice",
        ref: row.id,
        number: row.number ?? "",
        total: toMoneyString(row.total),
        currency: row.currency,
        at: (row.issuedAt ?? row.createdAt).toISOString(),
    };
}

/** Newest first, and only as many as Home lists. */
export function latestChanges(changes: AccountChange[]): AccountChange[] {
    return [...changes]
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, CHANGE_ROWS);
}
