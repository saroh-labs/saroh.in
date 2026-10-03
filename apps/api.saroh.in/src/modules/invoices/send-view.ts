/**
 * What the invoice read says about sending it (round-2 D17). Kept apart from
 * the service so `serialize.ts` can name it without importing the service.
 */

/** Where an invoice can go: the business's email, the customer's account thread. */
export type SendChannel = "email" | "thread";

/**
 * Why an invoice can't be sent, when it can't:
 * - `NOT_OWED`: paid, void, credited, an order's paper or a credit note;
 * - `NO_EMAIL_PROVIDER`: no email provider connected, and no thread;
 * - `NO_EMAIL_ADDRESS`: a provider, but nowhere to send it, and no thread;
 * - `AUTOPAY_PENDING`: an autopay charge is under way on it (D13), so no
 *   pay link goes out until it is answered.
 *
 * A missing payment provider no longer blocks a send (DEC-070): the link
 * goes as a view link, and `payOnline` says so.
 */
export type SendBlocker =
    "NOT_OWED" | "NO_EMAIL_PROVIDER" | "NO_EMAIL_ADDRESS" | "AUTOPAY_PENDING";

/**
 * The one flag Invoice Detail and Home's Send reminder (F4) both read, so
 * they can't disagree (D17). No channels: no Send and no Send reminder, and
 * the API answers 409; "Copy pay link" stays.
 */
export interface InvoiceSendView {
    channels: SendChannel[];
    reason?: SendBlocker;
    /** Where the email would go. */
    emailTo?: string;
    /**
     * The link sent is a pay link: Payments is on and a provider can take
     * the money (DEC-070). False: a link to view the invoice, so the button
     * says "Send invoice", not "Send with pay link".
     */
    payOnline: boolean;
    /** A send or reminder went in the last day: the next reminder can go from here. */
    nextReminderAt: string | null;
}

/** One send or reminder, for "What happened". */
export interface InvoiceSentView {
    id: string;
    channel: "email";
    to: string;
    at: string;
    reminder: boolean;
    /** QUEUED | SENT | FAILED | SUPPRESSED (the customer turned email off). */
    status: string;
}
