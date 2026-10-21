import { readOnlyLine, WHO_CAN_CHANGE } from "@/lib/access/who-can-change";

/**
 * "Emails to your customers" (DEC-174, U4 #1135): the business's switches
 * for the automatic emails Saroh sends its customers from the business's
 * own email (a renewal invoice, a refund, a membership change…), on
 * Settings › Providers under "Updates in Messages".
 *
 * The API decides what is listed (`communications/notice-settings.ts`):
 * only the kinds Saroh sends today, whose module is on for the business.
 * So nobody is shown a switch that does nothing, and a business offered
 * none sees no row at all. Its words (the label and what the customer
 * gets) are the API's too; the only names kept here are for Settings ›
 * Activity, which has nothing but the kind to go on.
 *
 * Pure: safe in server and client components.
 */

/** One switch, as `GET …/customer-notices/settings` lists it. */
export interface CustomerEmail {
    /** `NOTICE_KINDS` in the API, e.g. "MEMBERSHIP". */
    kind: string;
    /** "Membership emails". */
    label: string;
    /** What the customer gets, in one sentence. */
    says: string;
    /** Whether the business sends it. */
    on: boolean;
    /** Whether it is sent when the business has never chosen. */
    default: boolean;
    /** Whether the business can change it now. */
    offered: boolean;
    /** Why it can't, when it can't ("NO_EMAIL"). */
    reason: string | null;
    /** The same, in words ("Connect your email first"). */
    why: string | null;
}

/** `GET …/customer-notices/settings`. */
export interface CustomerEmails {
    notices: CustomerEmail[];
    /** `comms:manage`: whether this person may change them. */
    canChange: boolean;
    /** Whether the business has its own email provider connected. */
    emailConnected: boolean;
}

function isCustomerEmail(value: unknown): value is CustomerEmail {
    if (typeof value !== "object" || value === null) return false;
    const n = value as Record<string, unknown>;
    const textOrNull = (v: unknown) => v === null || typeof v === "string";
    return (
        typeof n.kind === "string" &&
        typeof n.label === "string" &&
        typeof n.says === "string" &&
        typeof n.on === "boolean" &&
        typeof n.default === "boolean" &&
        typeof n.offered === "boolean" &&
        textOrNull(n.reason) &&
        textOrNull(n.why)
    );
}

export function isCustomerEmails(body: unknown): body is CustomerEmails {
    if (typeof body !== "object" || body === null) return false;
    const b = body as Record<string, unknown>;
    return (
        Array.isArray(b.notices) &&
        b.notices.every(isCustomerEmail) &&
        typeof b.canChange === "boolean" &&
        typeof b.emailConnected === "boolean"
    );
}

export const CUSTOMER_EMAILS_TITLE = "Emails to your customers";
export const CUSTOMER_EMAILS_ROW = "Automatic emails";

/** What no email provider means for all of them: said once, never per row. */
export const CUSTOMER_EMAILS_NO_EMAIL =
    "None of these go out until your email is connected.";

/** The reason someone without `comms:manage` can only read them. */
export const CUSTOMER_EMAILS_READ_ONLY = `${readOnlyLine("these emails", true)} ${WHO_CAN_CHANGE}`;

export interface CustomerEmailsRow {
    /** "All on", "All off", or "9 on, 1 off". */
    status: string;
    /** Every one off: said as a warning. */
    allOff: boolean;
    /** Which are not sent, or that all are. */
    says: string;
    /**
     * One quiet line under it, at most: that none go out without an email
     * provider, else, for someone who can't change them, why. Never both.
     */
    line: string | null;
}

/** "A, B and C", "A, B and 3 more". */
function named(labels: readonly string[]): string {
    if (labels.length <= 3) {
        return labels.length === 1
            ? labels.join("")
            : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
    }
    return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`;
}

/**
 * The read row, or null when there is nothing to show: unread, or no
 * automatic email this business is offered (none Saroh sends yet, or every
 * one's module off).
 */
export function customerEmailsRow(
    state: CustomerEmails | null | undefined,
): CustomerEmailsRow | null {
    if (!state || state.notices.length === 0) return null;
    const on = state.notices.filter((n) => n.on);
    const off = state.notices.filter((n) => !n.on);
    const status =
        off.length === 0
            ? "All on"
            : on.length === 0
              ? "All off"
              : `${on.length} on, ${off.length} off`;
    const says =
        off.length === 0
            ? "Each one is sent as it happens."
            : on.length === 0
              ? "Your customers get none of these."
              : `Not sent: ${named(off.map((n) => n.label))}.`;
    const line =
        !state.emailConnected && on.length > 0
            ? CUSTOMER_EMAILS_NO_EMAIL
            : !state.canChange
              ? CUSTOMER_EMAILS_READ_ONLY
              : null;
    return { status, allOff: on.length === 0, says, line };
}

/**
 * The one note the sheet shows, or null: no email provider, so none go out
 * yet. What is chosen still saves, for when it is connected.
 */
export function customerEmailsNote(state: CustomerEmails): string | null {
    if (state.emailConnected) return null;
    return state.canChange
        ? `${CUSTOMER_EMAILS_NO_EMAIL} What you choose here still saves.`
        : CUSTOMER_EMAILS_NO_EMAIL;
}

/**
 * The line under one switch: why it can't be changed, unless the sheet's
 * note already says it (no email provider), so nothing is said twice.
 */
export function customerEmailWhy(
    email: CustomerEmail,
    state: CustomerEmails,
): string | null {
    if (email.offered || !email.why) return null;
    if (email.reason === "NO_EMAIL" && !state.emailConnected) return null;
    return email.why;
}

/** Whether this person can flip this switch now. */
export function customerEmailLocked(
    email: CustomerEmail,
    state: CustomerEmails,
): boolean {
    return !state.canChange || !email.offered;
}

/** The sheet's one sentence under its title. */
export function customerEmailsSheetLine(state: CustomerEmails): string {
    return state.canChange
        ? "Each switch saves as you flip it."
        : CUSTOMER_EMAILS_READ_ONLY;
}

/** The toast after a switch is flipped: "Membership emails turned off." */
export function customerEmailSaved(label: string, on: boolean): string {
    return `${label} turned ${on ? "on" : "off"}.`;
}

/** The list with one switch moved, for the screen before the save lands. */
export function withCustomerEmail(
    state: CustomerEmails,
    change: { kind: string; on: boolean },
): CustomerEmails {
    return {
        ...state,
        notices: state.notices.map((n) =>
            n.kind === change.kind ? { ...n, on: change.on } : n,
        ),
    };
}

/**
 * What each kind is called, for Settings › Activity, whose audit row holds
 * only the kind. The API's `NOTICE_WORDS` labels; a kind not here is said
 * generally, never as a raw key.
 */
export const CUSTOMER_EMAIL_LABELS: Readonly<Record<string, string>> = {
    RENEWAL_INVOICE: "Renewal invoices",
    AUTOPAY_FAILED: "Failed autopay charges",
    MEMBERSHIP: "Membership emails",
    REFUND: "Refunds",
    TEAM_REPLY: "Your replies in Messages",
    ENQUIRY_REPLY: "Enquiry replies",
    ORDER_DELIVERY: "Delivery updates",
    COURSE: "Course emails",
    PACK_CREDITS: "Pack credits",
    BACK_IN_STOCK: "Back in stock",
    OVERDUE_REMINDERS: "Overdue reminders",
};

/** A kind's name for Activity, or null for one this app doesn't know. */
export function customerEmailLabel(kind: unknown): string | null {
    return typeof kind === "string"
        ? (CUSTOMER_EMAIL_LABELS[kind] ?? null)
        : null;
}
