import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor, formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { InvoicePayment, InvoiceShared } from "./service";

/**
 * What the invoice screens say (DEC-173, the Payments audit's copy
 * rewrites, INVPageA, INVPageA2 and INVRecordPlus). One place, so the list,
 * the details sheet, the page and the phone say the same thing in the same
 * words. Pure: no clock, no React, no server.
 *
 * The rewrites (FINDINGS, 19 Oct):
 * - "Mark paid" and "Record a payment" are one name: "Record payment".
 * - "Not paid. Mark it paid when the money arrives." is "Not paid yet. When
 *   the money comes in, record it."
 * - "77 overdue · ₹2,79,268, worked out from the due date" is "Overdue
 *   ₹2,79,268 · 77".
 * - "… isn't paid, 13 days past due" is "₹2,500 unpaid · 13 days late".
 * - "… hasn't been paid. Send it again, or call." is "1 day late. Share it
 *   on WhatsApp or call Vinay."
 */

/* The buttons ---------------------------------------------------------- */

/** The one name for writing down money that came in (was "Mark paid"). */
export const RECORD_PAYMENT = "Record payment";
/** The same, once part of it is paid. */
export const RECORD_THE_REST = "Record the rest";
export const ISSUE_AND_SHARE = "Issue and share";
export const ISSUE_IT = "Issue it";
export const SHARE_RECEIPT = "Share receipt";
export const SHARE_ON_WHATSAPP = "Share on WhatsApp";
export const SEND_BY_EMAIL = "Send by email";
export const MARK_IN_BANK = "Mark as in the bank";
export const BOUNCED = "Bounced";
export const CANCEL_OR_CORRECT = "Cancel or correct";
export const REMOVE_PAYMENT = "Remove payment";
/** On a payment's own line in the history. */
export const REMOVE_THIS_PAYMENT = "Remove this payment";
export const WRITE_AGAIN = "Write again";

/* The states ----------------------------------------------------------- */

export const PARTLY_PAID = "Partly paid";
export const CHEQUE_NOT_IN_BANK = "Cheque not in the bank";
/** A paid invoice whose cheque hasn't cleared: the pill and the row. */
export const PAID_CHEQUE_WAITING = "Paid · cheque not in the bank";
/** The payment sentence on an unpaid invoice. */
export const NOT_PAID_YET = "Not paid yet. When the money comes in, record it.";
/** A draft's money card, under "Draft · ₹7,500". */
export const DRAFT_NOTE =
    "No number yet. Issuing numbers it and locks the lines.";

/* Why something is off (FB-1: said beside it, never a missing button) -- */

/**
 * Record payment for a role without money (DEC-098). The read-only note
 * adds who can change it (`WHO_CAN_CHANGE`); the permission decides, never
 * the role's name.
 */
export const CANT_RECORD_PAYMENT = "Recording money isn't part of your role.";
/** The API's own refusal, said before anyone presses (DEC-173). */
export const PAID_IN_PART_NO_CANCEL =
    "Part of this invoice is paid. Remove its payments before cancelling it.";
/** One reminder a day, by email or WhatsApp (DEC-173). */
export const REMINDED_TODAY = "Reminded today. Next one tomorrow.";
/** Nothing goes out while autopay is charging it (D13). */
export const AUTOPAY_HOLD =
    "An autopay charge is under way. Sharing waits until the bank answers.";
export const NO_EMAIL_PROVIDER =
    "No email provider yet, so Saroh can't email it.";
export const NO_EMAIL_ADDRESS = "There's no email address on this invoice.";

/* Lines with figures ----------------------------------------------------- */

/** "13 days late", "1 day late". */
export function daysLate(days: number): string {
    return `${count(Math.max(1, days), "day")} late`;
}

/** "₹2,500 unpaid · 13 days late"; without a count, "₹2,500 unpaid". */
export function unpaidLine(money: string, days: number | null): string {
    return days && days > 0
        ? `${money} unpaid · ${daysLate(days)}`
        : `${money} unpaid`;
}

/** "Partly paid ₹1,000 of ₹2,500". */
export function partlyPaidLine(paid: string, total: string): string {
    return `${PARTLY_PAID} ${paid} of ${total}`;
}

/** "₹8,400 to collect". */
export function toCollect(money: string): string {
    return `${money} to collect`;
}

/** "₹4,400 left to pay". */
export function leftToPayLine(money: string): string {
    return `${money} left to pay`;
}

/** The money strip's Overdue figure in one line: "Overdue ₹2,79,268 · 77". */
export function overdueFigure(money: string, invoices: number): string {
    return `Overdue ${money} · ${formatNumber(invoices)}`;
}

/** "Cheques not in the bank · 2 · ₹14,000": the line under the strip. */
export function chequesWaitingLine(cheques: number, money: string): string {
    return `Cheques not in the bank · ${formatNumber(cheques)} · ${money}`;
}

/** "1 day late. Share it on WhatsApp or call Vinay." */
export function lateNudge(days: number, firstName: string): string {
    return `${daysLate(days)}. Share it on WhatsApp or call ${firstName}.`;
}

/* How it was paid, inside a sentence -------------------------------------- */

const WAY: Record<string, string> = {
    CASH: "cash",
    UPI: "UPI",
    CARD: "card",
    BANK_TRANSFER: "bank transfer",
    CHEQUE: "cheque",
    ONLINE: "online",
    OTHER: "another way",
};

/** "cash", "UPI", "bank transfer", "cheque": after "·" or "Paid ₹4,000 by". */
export function paymentWay(method: string): string {
    return WAY[method] ?? method.toLowerCase().replace(/_/g, " ");
}

/* What happened: one line per event of a payment ------------------------ */

export interface PaymentEvent {
    at: string;
    text: string;
    /** It no longer counts: drawn struck through. */
    struck?: boolean;
}

/**
 * The history's lines for one payment, oldest first: it came in, then (for
 * a cheque) it cleared or bounced, then, if it was recorded by mistake,
 * its removal with the reason. `totalCents` is the invoice's, so a part
 * payment says so.
 */
export function paymentEvents(
    p: InvoicePayment,
    totalCents: number,
): PaymentEvent[] {
    const money = formatMoneyMajor(p.amount, p.currency);
    const part = Math.round(Number(p.amount) * 100) < totalCents;
    const gone = p.removed !== null || p.bankStatus === "BOUNCED";
    const events: PaymentEvent[] = [];
    if (p.cheque) {
        const no = p.cheque.number ? `Cheque ${p.cheque.number}` : "Cheque";
        events.push({
            at: p.receivedAt,
            text:
                p.bankStatus === "WAITING"
                    ? `Cheque received · ${money} · not in the bank yet`
                    : `Cheque received · ${money}`,
            struck: gone,
        });
        if (p.bankStatus === "CLEARED" && p.clearedAt) {
            events.push({ at: p.clearedAt, text: `${no} is in the bank` });
        }
        if (p.bankStatus === "BOUNCED" && p.bouncedAt) {
            events.push({
                at: p.bouncedAt,
                text: `${no} bounced · ${money} owed again${
                    p.bounceReason ? ` · ${p.bounceReason}` : ""
                }`,
            });
        }
    } else {
        events.push({
            at: p.receivedAt,
            text:
                p.method === "ONLINE"
                    ? `Paid online · ${money}`
                    : part
                      ? `Part payment ${money} · ${paymentWay(p.method)}`
                      : `Payment recorded · ${paymentWay(p.method)}`,
            struck: gone,
        });
    }
    if (p.removed) {
        events.push({
            at: p.removed.at,
            text: `Payment of ${money} removed${
                p.removed.reason ? ` · ${p.removed.reason}` : ""
            }`,
        });
    }
    return events;
}

/** "Cheque 004512 · HDFC Bank · received 19 Oct": the cheque card's line. */
export function chequeLine(
    p: InvoicePayment,
    timeZone: string,
    now = new Date(),
): string {
    const parts = [
        p.cheque?.number ? `Cheque ${p.cheque.number}` : "Cheque",
        p.cheque?.bank ?? null,
        `received ${formatDate(p.receivedAt, timeZone, { now })}`,
    ];
    return parts.filter(Boolean).join(" · ");
}

/* What happened: one line per share by hand ---------------------------- */

/**
 * "Shared on WhatsApp", "Reminder shared on WhatsApp", "Link copied". On
 * WhatsApp Saroh only knows it was opened, so it never says "sent".
 */
export function sharedLine(s: Pick<InvoiceShared, "channel" | "kind">): string {
    const what =
        s.kind === "REMINDER"
            ? "Reminder"
            : s.kind === "RECEIPT"
              ? "Receipt"
              : null;
    switch (s.channel) {
        case "WHATSAPP":
            return what ? `${what} shared on WhatsApp` : "Shared on WhatsApp";
        case "LINK":
            return what ? `${what} link copied` : "Link copied";
        case "PDF":
            return "PDF downloaded";
        case "PRINT":
            return "Printed";
    }
}
