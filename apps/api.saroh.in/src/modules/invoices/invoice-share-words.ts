import { dayWords, moneyWordsMinor } from "../../common/words-format";

/**
 * What an invoice's message says when the business shares it by hand
 * (DEC-173, U5 #1117): on WhatsApp, as a message to copy, or in the bulk
 * reminder flow. The API words it, so the share sheet, the bulk flow and
 * any later sender all say the same thing, in the business's voice
 * (INVShareA, INVBulkSend).
 *
 * Plain text, one paragraph: WhatsApp shows it as typed. Pure: no Prisma,
 * no clock.
 */

/** The three messages: a new invoice, a reminder, and a thank-you receipt. */
export const SHARE_KINDS = ["NEW", "REMINDER", "RECEIPT"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** How a payment came in, as the end of "your payment of ₹4,000 …". */
const METHOD_WORDS: Readonly<Record<string, string>> = {
    CASH: "in cash",
    UPI: "by UPI",
    BANK_TRANSFER: "by bank transfer",
    CARD: "by card",
    CHEQUE: "by cheque",
    ONLINE: "online",
};

/** "by UPI", or null for OTHER or a method Saroh doesn't name. */
export function paymentMethodWords(method: string): string | null {
    return METHOD_WORDS[method] ?? null;
}

export interface ShareWordsInput {
    kind: ShareKind;
    /** The business's name, as it signs its messages. */
    business: string;
    /** "Vivek", or null when the bill-to has no name. */
    firstName: string | null;
    /** "RC/26-27/0106". */
    number: string;
    currency: string;
    /** The invoice's total, in paise. */
    totalCents: number;
    /** Paid so far (live ledger money), in paise. */
    paidCents: number;
    dueAt: Date | null;
    /** Issued and past its due date. */
    overdue: boolean;
    /** The business's time zone, for the due date. */
    zone: string;
    /** The invoice's link, or null when the message carries none. */
    link: string | null;
    /** The link takes payment (DEC-070); otherwise it shows the invoice. */
    payOnline: boolean;
    /** RECEIPT: the payment it thanks them for. */
    payment?: { amountCents: number; method: string } | null;
}

/** "Hi Vivek, this is Pulse." (and "Rye & Co." keeps its one full stop). */
function greeting(input: ShareWordsInput): string {
    const business = /[.!?]$/.test(input.business)
        ? input.business
        : `${input.business}.`;
    return input.firstName
        ? `Hi ${input.firstName}, this is ${business}`
        : `Hello, this is ${business}`;
}

/** The sentence that names the invoice and what it asks for. */
function asking(input: ShareWordsInput): string {
    const money = (cents: number) => moneyWordsMinor(cents, input.currency);
    const total = money(input.totalCents);
    const leftCents = Math.max(0, input.totalCents - input.paidCents);
    const partly = input.paidCents > 0 && leftCents > 0;
    const left = `${money(leftCents)} left of ${total}`;
    const due = input.dueAt ? dayWords(input.dueAt, input.zone) : null;
    const n = input.number;

    if (input.kind === "NEW") {
        return partly
            ? `Here is your invoice ${n}, with ${left} to pay${due ? `, due on ${due}` : ""}.`
            : `Here is your invoice ${n} for ${total}${due ? `, due on ${due}` : ""}.`;
    }
    if (input.overdue && due) {
        return partly
            ? `Your invoice ${n} has ${left} to pay. It was due on ${due}.`
            : `Your invoice ${n} for ${total} was due on ${due}.`;
    }
    if (partly) {
        return `A reminder that your invoice ${n} has ${left} to pay${due ? `, due on ${due}` : ""}.`;
    }
    return due
        ? `A reminder that your invoice ${n} for ${total} is due on ${due}.`
        : `A reminder that your invoice ${n} for ${total} is still to be paid.`;
}

/** The thank-you: what came in, and what is paid and left. */
function thanking(input: ShareWordsInput): string {
    const money = (cents: number) => moneyWordsMinor(cents, input.currency);
    const leftCents = Math.max(0, input.totalCents - input.paidCents);
    const payment = input.payment;
    const how = payment ? paymentMethodWords(payment.method) : null;
    const thanks = payment
        ? `Thank you for your payment of ${money(payment.amountCents)}${how ? ` ${how}` : ""} for invoice ${input.number}.`
        : `Thank you for your payment for invoice ${input.number}.`;
    const standing =
        leftCents === 0
            ? "It is now paid in full."
            : `Paid so far: ${money(input.paidCents)} of ${money(input.totalCents)}. Left to pay: ${money(leftCents)}.`;
    return `${thanks} ${standing}`;
}

/**
 * The whole message, ready for WhatsApp:
 * "Hi Vivek, this is Rye & Co. Your invoice RC/26-27/0106 for ₹8,400 was
 * due on 7 Oct. You can see it and pay here: <link> Thank you."
 */
export function shareMessage(input: ShareWordsInput): string {
    const parts = [greeting(input)];
    if (input.kind === "RECEIPT") {
        parts.push(thanking(input));
        if (input.link) parts.push(`You can see it here: ${input.link}`);
        return parts.join(" ");
    }
    parts.push(asking(input));
    if (input.link) {
        parts.push(
            input.payOnline
                ? `You can see it and pay here: ${input.link}`
                : `You can see it and how to pay here: ${input.link}`,
        );
    }
    parts.push("Thank you.");
    return parts.join(" ");
}

/** The first word of a bill-to name: "Vivek" of "Vivek Nair", or null. */
export function firstNameOf(name: string | null | undefined): string | null {
    const first = name?.trim().split(/\s+/)[0] ?? "";
    return first === "" ? null : first;
}
