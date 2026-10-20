import { formatMoneyMajor, minorOf } from "@/lib/format/money";
import { METHOD_WORD } from "@/lib/payments/method-words";

import type { Invoice, InvoicePaymentMethod } from "./service";
import { PARTLY_PAID } from "./words";

/**
 * Record payment's rules and words (DEC-173, U10 #1122, INVRecordPlus):
 * the amount (all of what is left, or part of it, never more), how it was
 * paid, the cheque's fields, the day it came in, and what the sheet, its
 * button and its Undo say. Pure: no clock but the one passed in, no React,
 * no server, so every line is tested rather than read off a screen.
 */

/** What Record payment needs of an invoice, wherever it is opened from. */
export interface PaymentTarget {
    id: string;
    number: string | null;
    /** Who it is billed to: "Vivek Nair". */
    who: string;
    currency: string;
    /** Major units, as the API sends them: "8400.00". */
    total: string;
    /** What is left to pay, major units: "8400.00". */
    leftToPay: string;
    /**
     * Where its receipt is emailed (the business's own provider and the
     * customer's address), or null when it can't be: then the receipt is
     * shared on WhatsApp by hand.
     */
    emailTo: string | null;
}

/** The ways a payment is recorded by hand, in the order the strip shows them. */
export const RECORD_METHODS: readonly {
    value: InvoicePaymentMethod;
    label: string;
}[] = [
    { value: "CASH", label: METHOD_WORD.CASH },
    { value: "UPI", label: METHOD_WORD.UPI },
    { value: "CARD", label: METHOD_WORD.CARD },
    { value: "BANK_TRANSFER", label: METHOD_WORD.BANK_TRANSFER },
    { value: "CHEQUE", label: "Cheque" },
    { value: "OTHER", label: METHOD_WORD.OTHER },
];

/** UPI is chosen first, as it always was. */
export const FIRST_METHOD: InvoicePaymentMethod = "UPI";

/** A money string as paise: "4000.50" → 400050; anything else → null. */
export function toPaise(amount: string): number | null {
    const trimmed = amount.trim();
    if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
    // "4000." is 4000 as typed; the rest is read as every amount is.
    return minorOf(trimmed.replace(/\.$/, ""));
}

/** Paise back to the API's string: 400050 → "4000.50". */
export function fromPaise(paise: number): string {
    return (paise / 100).toFixed(2);
}

/** "₹8,400" from paise, in the invoice's currency. */
export function moneyOf(paise: number, currency: string): string {
    return formatMoneyMajor(fromPaise(paise), currency);
}

/** The sheet's line under its title: "RC/26-27/0106 · Vivek Nair · ₹8,400 left of ₹8,400". */
export function recordSubline(t: PaymentTarget): string {
    const left = formatMoneyMajor(t.leftToPay, t.currency);
    const total = formatMoneyMajor(t.total, t.currency);
    return `${t.number ?? "Invoice"} · ${t.who} · ${left} left of ${total}`;
}

/** The first choice of the amount strip: "All ₹8,400". */
export function allLabel(t: PaymentTarget): string {
    return `All ${formatMoneyMajor(t.leftToPay, t.currency)}`;
}

export type AmountCheck =
    | { ok: true; paise: number; part: boolean }
    | { ok: false; reason: "empty" | "zero"; message: string }
    | {
          ok: false;
          reason: "over";
          message: string;
          /** What is left, for the "Record ₹8,400" way out. */
          leftPaise: number;
      };

/**
 * Whether an amount can be recorded: above 0, and never more than is left
 * (no advances yet, DEC-173). Said when Record is pressed, in the board's
 * words: "₹9,000 is ₹600 more than what's left (₹8,400). Record ₹8,400."
 */
export function checkAmount(amount: string, t: PaymentTarget): AmountCheck {
    const paise = toPaise(amount);
    if (paise === null || amount.trim() === "") {
        return {
            ok: false,
            reason: "empty",
            message: "Enter the amount received.",
        };
    }
    if (paise <= 0) {
        return {
            ok: false,
            reason: "zero",
            message: "Enter an amount above 0.",
        };
    }
    const left = toPaise(t.leftToPay) ?? 0;
    if (paise > left) {
        return {
            ok: false,
            reason: "over",
            leftPaise: left,
            message: overpayLine(paise, left, t.currency),
        };
    }
    return { ok: true, paise, part: paise < left };
}

/** "₹9,000 is ₹600 more than what's left (₹8,400). Record ₹8,400." */
export function overpayLine(
    paise: number,
    leftPaise: number,
    currency: string,
): string {
    const { said, fix } = overpayParts(paise, leftPaise, currency);
    return `${said} ${fix}.`;
}

/** The overpay line in two: what is wrong, and the button that fixes it. */
export function overpayParts(
    paise: number,
    leftPaise: number,
    currency: string,
): { said: string; fix: string } {
    const left = moneyOf(leftPaise, currency);
    return {
        said: `${moneyOf(paise, currency)} is ${moneyOf(paise - leftPaise, currency)} more than what's left (${left}).`,
        fix: `Record ${left}`,
    };
}

/**
 * The line under the amount, as it is typed: all of it, or what stays to
 * pay after a part payment. Nothing while the box can't be read.
 */
export function amountHint(amount: string, t: PaymentTarget): string | null {
    const paise = toPaise(amount);
    const left = toPaise(t.leftToPay) ?? 0;
    if (paise === null || paise <= 0 || paise > left) return null;
    if (paise === left)
        return "All of what's left. Type less for a part payment.";
    return `${moneyOf(left - paise, t.currency)} stays to pay. The invoice reads “${PARTLY_PAID}”.`;
}

/** The sheet's button: "Record ₹4,000", or "Record payment" before an amount. */
export function recordLabel(amount: string, currency: string): string {
    const paise = toPaise(amount);
    return paise && paise > 0
        ? `Record ${moneyOf(paise, currency)}`
        : "Record payment";
}

/** The reference box's words, by how it was paid. */
export function referenceWords(method: InvoicePaymentMethod): {
    label: string;
    hint: string;
    placeholder: string;
} {
    const hint = "Helps when matching your bank.";
    switch (method) {
        case "UPI":
            return {
                label: "UPI reference",
                hint,
                placeholder: "12-digit UPI ref",
            };
        case "BANK_TRANSFER":
            return {
                label: "Bank reference",
                hint,
                placeholder: "UTR or transfer reference",
            };
        case "CARD":
            return {
                label: "Card slip reference",
                hint: "From the card machine's slip.",
                placeholder: "Approval code or last 4 digits",
            };
        case "CHEQUE":
            return {
                label: "Reference",
                hint: "Anything else that helps you find it.",
                placeholder: "e.g. deposit slip number",
            };
        case "CASH":
            return {
                label: "Reference",
                hint: "A receipt book number, if you keep one.",
                placeholder: "e.g. receipt 214",
            };
        default:
            return {
                label: "Reference",
                hint: "Anything that helps you find it later.",
                placeholder: "A reference",
            };
    }
}

export type ReceivedOn = "today" | "yesterday" | "pick";

/** The day it came in, from the strip (and the picked day for Pick). */
export function receivedDate(
    on: ReceivedOn,
    picked: Date | undefined,
    now: Date,
): Date | null {
    if (on === "today") return now;
    if (on === "yesterday") {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d;
    }
    return picked ?? null;
}

/**
 * The receipt, said in the sheet before recording (owner, 20 Oct): it
 * goes by itself after the Undo window through the business's own email;
 * a cheque's goes once it is in the bank; with no email it is shared on
 * WhatsApp by hand.
 */
export function receiptNote(
    method: InvoicePaymentMethod,
    t: Pick<PaymentTarget, "emailTo" | "who">,
): string {
    if (method === "CHEQUE") {
        return t.emailTo
            ? `The receipt is emailed to ${t.emailTo} once you mark the cheque as in the bank.`
            : "The receipt can be shared once you mark the cheque as in the bank.";
    }
    return t.emailTo
        ? `The receipt is emailed to ${t.emailTo} once Undo has passed.`
        : "No email provider yet, so Saroh can't email the receipt. Share it on WhatsApp after recording.";
}

/** What a cheque is said to be while it waits for the bank. */
export const CHEQUE_WAITS_NOTE =
    "Recorded as not in the bank yet. Mark it when the cheque clears. If it bounces, the amount is owed again.";

/**
 * The Undo toast once it is recorded: "₹4,000 recorded on RC/26-27/0106.
 * ₹4,400 left.", "… Paid in full.", or for a cheque "Cheque for ₹8,400
 * recorded on … Not in the bank yet.". The description says where the
 * receipt went, only for what isn't a cheque.
 */
export function recordedToast(input: {
    paise: number;
    method: InvoicePaymentMethod;
    target: Pick<PaymentTarget, "number" | "currency" | "emailTo">;
    /** What is left after it, from the API's answer. */
    leftAfter: string | undefined;
}): { message: string; description?: string } {
    const { paise, method, target } = input;
    const money = moneyOf(paise, target.currency);
    const on = target.number ?? "the invoice";
    if (method === "CHEQUE") {
        return {
            message: `Cheque for ${money} recorded on ${on}. Not in the bank yet.`,
        };
    }
    const leftPaise = input.leftAfter ? (toPaise(input.leftAfter) ?? 0) : 0;
    const after =
        leftPaise > 0
            ? `${moneyOf(leftPaise, target.currency)} left.`
            : "Paid in full.";
    return {
        message: `${money} recorded on ${on}. ${after}`,
        ...(target.emailTo
            ? { description: `Receipt emailed to ${target.emailTo}` }
            : {}),
    };
}

/** Record payment's target from an invoice the screen has read in full. */
export function paymentTargetOf(invoice: Invoice, who: string): PaymentTarget {
    return {
        id: invoice.id,
        number: invoice.number,
        who,
        currency: invoice.currency,
        total: invoice.total,
        // An API older than the ledger sends no `leftToPay`: all of it.
        leftToPay: invoice.leftToPay ?? invoice.total,
        emailTo:
            invoice.send?.channels.includes("email") && invoice.send.emailTo
                ? invoice.send.emailTo
                : null,
    };
}

/** "Vivek" from "Vivek Nair", for "Tell Vivek on WhatsApp after". */
export function firstName(who: string): string {
    return who.trim().split(/\s+/)[0] || who;
}

/** Two instants on the same local day. */
function sameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * When a cheque cleared, from the day picked: now for today, midday for
 * another day, and never before it was received (the API refuses that).
 */
export function clearedAtFor(
    picked: Date,
    receivedAt: string,
    now: Date,
): Date {
    const received = new Date(receivedAt);
    let at: Date;
    if (sameDay(picked, now)) {
        at = now;
    } else {
        at = new Date(picked);
        at.setHours(12, 0, 0, 0);
    }
    return at < received ? received : at;
}

/**
 * The bounced dialog's sentence: "This removes the ₹8,400 payment.
 * RC/26-27/0106 is owed again and shows as overdue (due 7 Oct)." The due
 * date is the caller's, written in the business's zone.
 */
export function bouncedLine(input: {
    money: string;
    number: string | null;
    /** "7 Oct", when it is past due; else null. */
    overdueSince: string | null;
}): string {
    const on = input.number ?? "The invoice";
    return input.overdueSince
        ? `This removes the ${input.money} payment. ${on} is owed again and shows as overdue (due ${input.overdueSince}).`
        : `This removes the ${input.money} payment. ${on} is owed again.`;
}
