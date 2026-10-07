import { fromMinor, toMinor, toMoneyString } from "../../common/money";
import type { CancelMoney } from "../bookings/booking-cancel";
import { PAYMENT_METHODS } from "../invoices/invoice-state";

/**
 * What a signed-in customer may see of their own bookings (round-2 plan A,
 * A6; ADR-011): the second allow-list file, re-exported by
 * `customer-view.ts` so a reviewer still reads one place to know what can
 * leave the account routes. Every answer is built here from named fields,
 * never by spreading a row.
 *
 * Never here: another person on the same class, the booker fields a staff
 * member typed, staff notes, the booking's intake note, payment references,
 * or internal ids beyond a row's own opaque `ref` (a service's id is public:
 * the booking page links by it).
 */

export type AccountBookingState =
    "booked" | "attended" | "missed" | "cancelled";

/**
 * What cancelling it now does (DEC-051, DEC-058), worked out on the server so
 * the sheet says only what will happen.
 */
export interface AccountCancelTerms {
    /** Past the free-cancel deadline fixed when it was booked. */
    late: boolean;
    /** That deadline; null when the business has no free-cancel rule. */
    freeUntil: string | null;
    /**
     * Money paid online for it: handed back ("refund"), kept because it is
     * late ("kept-late") or because the business doesn't refund on its own
     * ("kept-policy"), on its treatment's order ("order"), or none paid.
     */
    money: "refund" | "kept-late" | "kept-policy" | "order" | "none";
    /** A class paid with a pack or a membership: back, or kept (late). */
    credit: "back" | "kept" | null;
}

export interface AccountBookingRow {
    ref: string;
    service: string;
    /** The service's id, for the booking page (a class moves there). */
    serviceRef: string;
    startAt: string;
    endAt: string;
    timezone: string;
    /** Who it is with, by the name the business shows. */
    staff: string | null;
    /** Video call rather than in person; null when the service says neither. */
    online: boolean | null;
    state: AccountBookingState;
    /** A one-to-one, or a place in a class. */
    kind: "one" | "class";
    /** "Visit 2 of 3" when it is a visit of a treatment (E9). */
    visit: { number: number; of: number } | null;
    /** Cancelled inside the free-cancel window. */
    cancelledLate: boolean;
    /**
     * How it can be moved now: in a sheet of free times ("sheet", a
     * one-to-one), on the booking page ("page", a class), only by calling
     * the business ("call", inside the late window), or not at all (null).
     */
    move: "sheet" | "page" | "call" | null;
    /** What cancelling it now does; null when it can't be cancelled here. */
    cancel: AccountCancelTerms | null;
    /**
     * What has been paid for it (UX-049): an amount paid online, at the
     * desk, or both, or a class of a pack or membership; null when nothing
     * is paid yet, or it is a treatment's visit (paid on its order).
     */
    paid: AccountBookingPaid | null;
}

/** What a customer has paid for one booking (UX-049). */
export interface AccountBookingPaid {
    how: "online" | "desk" | "both" | "pack" | "membership";
    /** "800.00"; null for a class of a pack or membership. */
    amount: string | null;
    currency: string | null;
}

/** One visit of a treatment, as its card lists it (E9, E10). */
export interface AccountTreatmentVisit {
    number: number;
    /** The booking that stands for it; null while it is still to book. */
    ref: string | null;
    startAt: string | null;
    timezone: string | null;
    staff: string | null;
    online: boolean | null;
    state: "done" | "booked" | "missed" | "to-book";
}

/** A treatment bought as one order, shown as its visits (E9). */
export interface AccountTreatment {
    /** The order's ref, for booking its next visit. */
    ref: string;
    name: string;
    total: string;
    currency: string;
    /** Paid for in full. */
    paid: boolean;
    visits: AccountTreatmentVisit[];
    /** Visits attended. */
    done: number;
    /**
     * The visit the customer may book now: the first still to book, once
     * none is booked and waiting. Null otherwise, or once the order is
     * cancelled or refunded.
     */
    bookNext: number | null;
}

export interface AccountBookings {
    comingUp: AccountBookingRow[];
    past: AccountBookingRow[];
    cancelled: AccountBookingRow[];
    treatments: AccountTreatment[];
}

/** Free times to move a one-to-one to, or to book a treatment's visit at. */
export interface AccountTimes {
    service: string;
    /** Who they are with: the same person as now, or null. */
    staff: string | null;
    timezone: string;
    times: string[];
}

/** What a cancel did, in the customer's terms. */
export interface AccountCancelResult {
    booking: AccountBookingRow;
    refund: {
        amount: string;
        currency: string;
        status: "SENT" | "CONFIRMING" | "REFUSED";
    } | null;
    kept: { amount: string; currency: string } | null;
    /** A visit of a treatment: its money is on the order. */
    order: boolean;
    /**
     * The business is told (A14): the cancel happened now, and its notice
     * to the team is queued. False when it was already cancelled.
     */
    told: boolean;
}

/** A move, and whether the business is told of it (A14). */
export type AccountMoveResult = AccountBookingRow & { told: boolean };

// ---- Serializers ------------------------------------------------------------

/** What a booking row reads, for the lists and the one-booking read. */
export interface BookingRowInput {
    id: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    status: string;
    outcome: string | null;
    locationType: string | null;
    cancelledLate: boolean;
    visitNumber: number | null;
    service: { id: string; name: string; capacity: number; visits: number };
    staff: { name: string } | null;
    /** How it was paid: PACK and MEMBERSHIP are a class of one. */
    paidWith?: string | null;
    /** A treatment's visit: paid on its order, never here. */
    orderId?: string | null;
    /** Its own PAID paper (`ROW_SELECT`). */
    invoices?: readonly {
        total: { toString(): string };
        currency: string;
        paymentMethod: string | null;
    }[];
}

/** A way of paying recorded by hand at the desk, never a provider's. */
function byHand(method: string | null): boolean {
    return (PAYMENT_METHODS as readonly (string | null)[]).includes(method);
}

/** What has been paid for a booking — see {@link AccountBookingPaid}. */
export function paidView(row: BookingRowInput): AccountBookingPaid | null {
    if (row.orderId) return null;
    if (row.paidWith === "PACK" || row.paidWith === "MEMBERSHIP") {
        return {
            how: row.paidWith === "PACK" ? "pack" : "membership",
            amount: null,
            currency: null,
        };
    }
    const paper = row.invoices ?? [];
    if (paper.length === 0) return null;
    const desk = paper.filter((p) => byHand(p.paymentMethod)).length;
    const minor = paper.reduce((n, p) => n + toMinor(p.total), 0);
    return {
        how: desk === 0 ? "online" : desk === paper.length ? "desk" : "both",
        amount: fromMinor(minor),
        currency: paper[0].currency,
    };
}

function online(locationType: string | null): boolean | null {
    return locationType === "ONLINE"
        ? true
        : locationType === "IN_PERSON"
          ? false
          : null;
}

function stateOf(row: Pick<BookingRowInput, "status" | "outcome">) {
    if (row.status === "CANCELLED") return "cancelled";
    if (row.outcome === "ATTENDED") return "attended";
    if (row.outcome === "NO_SHOW") return "missed";
    return "booked";
}

export function bookingRowView(
    row: BookingRowInput,
    actions: {
        move: AccountBookingRow["move"];
        cancel: AccountCancelTerms | null;
    } = { move: null, cancel: null },
): AccountBookingRow {
    return {
        ref: row.id,
        service: row.service.name,
        serviceRef: row.service.id,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        timezone: row.timezone,
        staff: row.staff?.name ?? null,
        online: online(row.locationType),
        state: stateOf(row),
        kind: row.service.capacity > 1 ? "class" : "one",
        visit:
            row.visitNumber !== null
                ? {
                      number: row.visitNumber,
                      of: Math.max(row.service.visits, row.visitNumber),
                  }
                : null,
        cancelledLate: row.status === "CANCELLED" && row.cancelledLate,
        move: actions.move,
        cancel: actions.cancel
            ? {
                  late: actions.cancel.late,
                  freeUntil: actions.cancel.freeUntil,
                  money: actions.cancel.money,
                  credit: actions.cancel.credit,
              }
            : null,
        paid: paidView(row),
    };
}

interface TreatmentBookingInput {
    id: string;
    visitNumber: number | null;
    startAt: Date;
    timezone: string;
    status: string;
    outcome: string | null;
    locationType: string | null;
    staff: { name: string } | null;
}

/**
 * A treatment's card: each visit done, booked, missed or still to book —
 * the booking that stands for a number now, since a cancelled visit leaves
 * its number free — and the one the customer may book next.
 */
export function treatmentView(
    order: {
        id: string;
        total: { toString(): string };
        currency: string;
        status: string;
        paymentStatus: string;
        service: { name: string; visits: number };
        bookings: TreatmentBookingInput[];
    },
    now: Date,
): AccountTreatment {
    const live = new Map<number, TreatmentBookingInput>();
    for (const b of order.bookings) {
        if (b.visitNumber === null || b.status !== "CONFIRMED") continue;
        live.set(b.visitNumber, b);
    }
    const count = Math.max(order.service.visits, 0, ...live.keys());
    const visits: AccountTreatmentVisit[] = [];
    for (let n = 1; n <= count; n++) {
        const b = live.get(n);
        visits.push(
            b
                ? {
                      number: n,
                      ref: b.id,
                      startAt: b.startAt.toISOString(),
                      timezone: b.timezone,
                      staff: b.staff?.name ?? null,
                      online: online(b.locationType),
                      state:
                          b.outcome === "ATTENDED"
                              ? "done"
                              : b.outcome === "NO_SHOW"
                                ? "missed"
                                : "booked",
                  }
                : {
                      number: n,
                      ref: null,
                      startAt: null,
                      timezone: null,
                      staff: null,
                      online: null,
                      state: "to-book",
                  },
        );
    }
    const closed =
        order.status === "CANCELLED" || order.paymentStatus === "REFUNDED";
    // One visit waiting at a time (the design's "each visit is booked when
    // the one before is done"): a visit booked and still to come holds it.
    const waiting = order.bookings.some(
        (b) =>
            b.status === "CONFIRMED" &&
            b.outcome === null &&
            b.startAt.getTime() > now.getTime(),
    );
    const next = visits.find((v) => v.state === "to-book") ?? null;
    return {
        ref: order.id,
        name: order.service.name,
        total: toMoneyString(order.total),
        currency: order.currency,
        paid: order.paymentStatus === "PAID",
        visits,
        done: visits.filter((v) => v.state === "done").length,
        bookNext: !closed && !waiting && next ? next.number : null,
    };
}

/** A cancel's answer: the booking now, and what happened to the money. */
export function cancelResultView(
    row: AccountBookingRow,
    result: CancelMoney,
    told = false,
): AccountCancelResult {
    return {
        booking: row,
        refund: result.refund
            ? {
                  amount: fromMinor(result.refund.amountCents),
                  currency: result.refund.currency,
                  status: result.refund.status,
              }
            : null,
        kept: result.kept
            ? {
                  amount: fromMinor(result.kept.amountCents),
                  currency: result.kept.currency,
              }
            : null,
        order: Boolean(result.treatmentOrderId),
        told,
    };
}
