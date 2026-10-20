/**
 * Remind many's read and its answer, as the API sends them (`POST
 * invoices/reminders/preview` and `POST invoices/reminders`, DEC-173 U5
 * #1117), which Home's Remind all calls with `quietDays` (DEC-171, U8).
 * Amounts are Decimal strings, absent for a role without `payment:read`
 * (DEC-098).
 */

/** How one invoice's reminder goes. */
export type ReminderWay = "EMAIL" | "WHATSAPP" | "WAIT" | "NONE";

/** Why, for each way (`invoice-reminders.service.ts`). */
export type ReminderReason =
    | "NO_EMAIL_PROVIDER"
    | "NO_EMAIL_ADDRESS"
    | "EMAIL_OFF"
    | "REMINDED_TODAY"
    | "REMINDED_RECENTLY"
    | "NOT_FOUND"
    | "DRAFT"
    | "PAID"
    | "ORDER"
    | "NOT_OWED"
    | "AUTOPAY_PENDING"
    | "UNREACHABLE";

export interface ReminderRow {
    invoiceId: string;
    way: ReminderWay;
    reason: ReminderReason | null;
    retryAt?: string;
    email?: string;
    phone?: string;
    emailBlocked?: "NO_EMAIL_PROVIDER" | "NO_EMAIL_ADDRESS" | "EMAIL_OFF";
    number?: string | null;
    name?: string | null;
    leftToPay?: string;
    currency?: string;
    dueAt?: string | null;
    lateDays?: number;
    lastAt?: string;
    /** "Reminded yesterday", "Sent 2 days ago". */
    lastWords?: string;
}

export interface ReminderPreview {
    invoices: ReminderRow[];
    /** The reminder the first email one gets, in words; null without money. */
    message: string | null;
}

export interface ReminderSendRow extends ReminderRow {
    outcome: "EMAILED" | "SUPPRESSED" | "FAILED" | "NOT_SENT";
    message?: string;
}

export interface ReminderSendResult {
    invoices: ReminderSendRow[];
}

/** What Remind all asks the routes for. */
export interface ReminderAsk {
    invoiceIds: string[];
    quietDays?: number;
}
