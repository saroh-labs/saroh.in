import type {
    AccountBookingRow,
    AccountCancelResult,
    AccountTimes,
    AccountTreatment,
} from "./bookings-model";

/**
 * What the account's Bookings ask of the site's server (round-2 plan A,
 * A6): its server actions, handed in, since the page never calls the API
 * itself. Each answers in the customer's words when it can't.
 */

export type TimesResult =
    { ok: true; times: AccountTimes } | { ok: false; message: string };

/** `told`: the business is told of the move (A14); absent before A14. */
export type MoveResult =
    | { ok: true; booking: AccountBookingRow; told?: boolean }
    | { ok: false; message: string };

export type CancelResult =
    { ok: true; result: AccountCancelResult } | { ok: false; message: string };

export type VisitResult =
    { ok: true; treatment: AccountTreatment } | { ok: false; message: string };

export interface BookingsApi {
    /** Free times to move a one-to-one to, with the same person. */
    moveTimes: (ref: string) => Promise<TimesResult>;
    move: (ref: string, startAt: string) => Promise<MoveResult>;
    cancel: (ref: string) => Promise<CancelResult>;
    /** Free times for a treatment's next visit. */
    visitTimes: (orderRef: string) => Promise<TimesResult>;
    bookVisit: (orderRef: string, startAt: string) => Promise<VisitResult>;
}

/** What a sheet says when the business couldn't be reached. */
export const OFFLINE = "We couldn't reach the business. Try again in a moment.";
