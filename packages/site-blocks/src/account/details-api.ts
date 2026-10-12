import type { TestReleaseRefusal } from "../test-release/words";
import type { AccountNotices } from "./details-model";
import type { PayNowResult } from "./plan-api";

/**
 * What the account's newer cards ask of the site's server (DEC-142): its
 * server actions, handed in, since a page never calls the API itself. Each
 * answers in the customer's words when it can't.
 */

/** "Pay now" on an open invoice: a pay link made when it is pressed. */
export type PayInvoice = (ref: string) => Promise<PayNowResult>;

export type LeaveResult =
    { ok: true } | { ok: false; message: string } | TestReleaseRefusal;

/** Leave a class's line, by its class and its start. */
export type LeaveLine = (
    serviceRef: string,
    startAt: string,
) => Promise<LeaveResult>;

export type NoticesResult =
    | { ok: true; notices: AccountNotices }
    | { ok: false; message: string }
    | TestReleaseRefusal;

/** Say whether the business may email them. */
export type SaveNotices = (email: boolean) => Promise<NoticesResult>;

/** Said when the site's server couldn't be reached. */
export const DETAILS_OFFLINE =
    "We couldn't reach the business. Try again in a moment.";
