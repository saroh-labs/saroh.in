import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";

import type { ShareMessageKind } from "./detail-actions";
import { hasPdf } from "./pdf";
import { paysOnline, wasSent } from "./send";
import type { Invoice, InvoicePayment } from "./service";
import {
    billedTo,
    lastLivePayment,
    lateBy,
    leftCents,
    paidCents,
} from "./status";
import {
    AUTOPAY_HOLD,
    CANT_SHARE,
    daysLate,
    NO_EMAIL_ADDRESS,
    NOTHING_PAID_YET,
    PAID_SHARE_RECEIPT,
} from "./words";

/**
 * The share sheet's rules (DEC-173, INVShareA, INVChannels, U11 #1123),
 * pure so each tab's state is tested rather than read off a screen.
 *
 * - **WhatsApp** is click-to-chat: the API mints a fresh link, words the
 *   message and logs the share; the sheet opens `wa.me` with it typed in.
 *   Saroh sends nothing and can't know it went.
 * - **Email** goes only through the business's own provider: send or remind
 *   (held ten seconds with Undo), or the receipt once something is paid.
 * - **Link** makes a fresh link (the one before stops, DEC-110), shown
 *   with Copy and its QR code.
 * - **PDF** downloads or prints the paper. Reading is enough for these.
 *
 * Each refusal mirrors the API's own (`invoice-share.service.ts`), said
 * before anyone presses (FB-1).
 */

export type ShareTab = "whatsapp" | "email" | "link" | "pdf";
export type ShareKind = ShareMessageKind;

/** What the sheet reads: the detail read of one invoice. */
export type ShareInvoice = Pick<
    Invoice,
    | "id"
    | "number"
    | "standing"
    | "kind"
    | "source"
    | "currency"
    | "total"
    | "dueAt"
    | "contact"
    | "billTo"
    | "updatedAt"
> &
    Partial<
        Pick<
            Invoice,
            | "leftToPay"
            | "paidSoFar"
            | "partlyPaid"
            | "payments"
            | "send"
            | "sent"
            | "online"
            | "order"
            | "sellerName"
        >
    >;

/** What this person may do with invoices (`invoiceCan`). */
export interface ShareCan {
    write: boolean;
}

/**
 * Why this invoice can't be shared at all, in the API's order and words; null
 * when it can. Its paper can still be downloaded or printed.
 */
export function shareRefusal(i: ShareInvoice): string | null {
    if (i.order || i.source === "ORDER") {
        return "This invoice belongs to an order, so share the order instead.";
    }
    if (i.kind === "CREDIT_NOTE")
        return "A credit note isn't shared from here.";
    switch (i.standing) {
        case "DRAFT":
            return "Issue the invoice before sharing it.";
        case "VOID":
            return "A void invoice isn't shared.";
        case "CREDITED":
            return "This invoice was cancelled by a credit note.";
        default:
            return null;
    }
}

/** The message an invoice opens on: a receipt once paid, a reminder once late or sent. */
export function defaultShareKind(i: ShareInvoice): ShareKind {
    if (i.standing === "PAID") return "RECEIPT";
    return i.standing === "OVERDUE" || wasSent(i.sent) ? "REMINDER" : "NEW";
}

export interface KindChoice {
    value: ShareKind;
    label: string;
    disabled?: boolean;
    reason?: string;
}

/** New invoice, Reminder, Thank you, paid: each off with why where it can't go. */
export function kindChoices(i: ShareInvoice): KindChoice[] {
    const paid = i.standing === "PAID";
    const anyPaid = paidCents(i) > 0;
    const owedOff = paid ? { disabled: true, reason: PAID_SHARE_RECEIPT } : {};
    return [
        { value: "NEW", label: "New invoice", ...owedOff },
        { value: "REMINDER", label: "Reminder", ...owedOff },
        {
            value: "RECEIPT",
            label: "Thank you, paid",
            ...(anyPaid ? {} : { disabled: true, reason: NOTHING_PAID_YET }),
        },
    ];
}

/** The kind to open on: the one asked for, unless it can't go here. */
export function startKind(i: ShareInvoice, asked?: ShareKind): ShareKind {
    const choices = kindChoices(i);
    const ok = (k: ShareKind) =>
        choices.some((c) => c.value === k && !c.disabled);
    if (asked && ok(asked)) return asked;
    const own = defaultShareKind(i);
    return ok(own) ? own : (choices.find((c) => !c.disabled)?.value ?? own);
}

/**
 * "Vivek Nair · ₹8,400 · 13 days late", the sheet's line under its title:
 * who, what is left, and when it is due or how late.
 */
export function shareLine(
    i: ShareInvoice,
    timeZone: string,
    now: Date = new Date(),
): string {
    const who = billedTo(i).name;
    const total = formatMoneyMajor(i.total, i.currency);
    if (i.standing === "PAID") return `${who} · ${total} · paid`;
    if (i.standing !== "ISSUED" && i.standing !== "OVERDUE") {
        return `${who} · ${total}`;
    }
    const left = formatMoneyMajor(leftCents(i) / 100, i.currency);
    const money = paidCents(i) > 0 ? `${left} left of ${total}` : total;
    if (i.standing === "OVERDUE") {
        return `${who} · ${money} · ${daysLate(lateBy(i, now))}`;
    }
    return i.dueAt
        ? `${who} · ${money} · due ${formatDate(i.dueAt, timeZone, { now })}`
        : `${who} · ${money}`;
}

/** Where the link sits in a preview: drawn as a chip, filled when shared. */
export const LINK_SLOT = "{link}";

/** "Vivek" of "Vivek Nair", or null. */
function firstOf(name: string | null | undefined): string | null {
    const first = name?.trim().split(/\s+/)[0] ?? "";
    return first === "" ? null : first;
}

/** How a payment came in, as the end of "your payment of ₹4,000 …". */
const METHOD_WORDS: Readonly<Record<string, string>> = {
    CASH: "in cash",
    UPI: "by UPI",
    BANK_TRANSFER: "by bank transfer",
    CARD: "by card",
    CHEQUE: "by cheque",
    ONLINE: "online",
};

/**
 * The message before it is shared, in the API's words
 * (`invoice-share-words.ts`), with `LINK_SLOT` where the link goes: the
 * link exists only once it is shared, which ends the one before, so the
 * preview never makes one. What WhatsApp opens with is the API's text.
 */
export function previewMessage({
    invoice: i,
    kind,
    business,
    timeZone,
    now = new Date(),
}: {
    invoice: ShareInvoice;
    kind: ShareKind;
    business: string;
    timeZone: string;
    now?: Date;
}): string {
    const name = i.sellerName ?? business;
    const signed = /[.!?]$/.test(name) ? name : `${name}.`;
    const first = firstOf(
        billedTo(i).name === "No one chosen" ? null : billedTo(i).name,
    );
    const parts = [
        first ? `Hi ${first}, this is ${signed}` : `Hello, this is ${signed}`,
    ];
    const money = (cents: number) => formatMoneyMajor(cents / 100, i.currency);
    const totalCents = Math.round(Number(i.total) * 100);
    const paid = paidCents(i);
    const leftC = Math.max(0, totalCents - paid);
    const n = i.number ?? "";

    if (kind === "RECEIPT") {
        const p: InvoicePayment | null = lastLivePayment(i.payments);
        const how = p ? METHOD_WORDS[p.method] : undefined;
        parts.push(
            p
                ? `Thank you for your payment of ${formatMoneyMajor(p.amount, p.currency)}${how ? ` ${how}` : ""} for invoice ${n}.`
                : `Thank you for your payment for invoice ${n}.`,
        );
        parts.push(
            leftC === 0 || i.standing === "PAID"
                ? "It is now paid in full."
                : `Paid so far: ${money(paid)} of ${money(totalCents)}. Left to pay: ${money(leftC)}.`,
        );
        parts.push(`You can see it here: ${LINK_SLOT}`);
        return parts.join(" ");
    }

    const total = money(totalCents);
    const partly = paid > 0 && leftC > 0;
    const left = `${money(leftC)} left of ${total}`;
    const due = i.dueAt
        ? formatDate(i.dueAt, timeZone, { now, year: "never" })
        : null;
    const overdue = i.standing === "OVERDUE";
    if (kind === "NEW") {
        parts.push(
            partly
                ? `Here is your invoice ${n}, with ${left} to pay${due ? `, due on ${due}` : ""}.`
                : `Here is your invoice ${n} for ${total}${due ? `, due on ${due}` : ""}.`,
        );
    } else if (overdue && due) {
        parts.push(
            partly
                ? `Your invoice ${n} has ${left} to pay. It was due on ${due}.`
                : `Your invoice ${n} for ${total} was due on ${due}.`,
        );
    } else if (partly) {
        parts.push(
            `A reminder that your invoice ${n} has ${left} to pay${due ? `, due on ${due}` : ""}.`,
        );
    } else {
        parts.push(
            due
                ? `A reminder that your invoice ${n} for ${total} is due on ${due}.`
                : `A reminder that your invoice ${n} for ${total} is still to be paid.`,
        );
    }
    parts.push(
        paysOnline(i.send, i.online)
            ? `You can see it and pay here: ${LINK_SLOT}`
            : `You can see it and how to pay here: ${LINK_SLOT}`,
    );
    parts.push("Thank you.");
    return parts.join(" ");
}

/** Why a share that tells the customer can't go; `retryAt`: when it can. */
export interface ShareOff {
    reason: string;
    /** One reminder a day: when the next can go. */
    retryAt?: string;
}

/** An autopay charge is under way on it (D13): nothing that asks to pay goes. */
export function charging(i: ShareInvoice): boolean {
    return !!i.online?.autopayCharge || i.send?.reason === "AUTOPAY_PENDING";
}

/** The next reminder's time, when one went in the last day and it is still ahead. */
export function reminderWaits(
    i: ShareInvoice,
    retryAt: string | null,
    now: Date = new Date(),
): string | null {
    const at = retryAt ?? i.send?.nextReminderAt ?? null;
    if (!at) return null;
    return Date.parse(at) > now.getTime() ? at : null;
}

/**
 * The WhatsApp tab's message: whether it can be shared (written, its link
 * made and logged). The number is asked for separately: a message can be
 * copied without one.
 */
export function whatsappOff(
    i: ShareInvoice,
    kind: ShareKind,
    can: ShareCan,
    retryAt: string | null,
    now: Date = new Date(),
): ShareOff | null {
    if (!can.write) return { reason: CANT_SHARE };
    const refused = shareRefusal(i);
    if (refused) return { reason: refused };
    const choice = kindChoices(i).find((c) => c.value === kind);
    if (choice?.disabled) return { reason: choice.reason ?? "" };
    if (kind !== "RECEIPT" && charging(i)) return { reason: AUTOPAY_HOLD };
    if (kind === "REMINDER") {
        const at = reminderWaits(i, retryAt, now);
        if (at) return { reason: "", retryAt: at };
    }
    return null;
}

/** The Link tab: whether a link can be made here. */
export function linkOff(i: ShareInvoice, can: ShareCan): ShareOff | null {
    if (!can.write) return { reason: CANT_SHARE };
    const refused = shareRefusal(i);
    if (refused) return { reason: refused };
    if (i.standing !== "PAID" && charging(i)) return { reason: AUTOPAY_HOLD };
    return null;
}

/**
 * The Email tab, one of:
 * - `receipt`: something is paid and it is a paid invoice: Email the receipt;
 * - `send` / `remind`: an owed invoice, by the business's own email;
 * - `noProvider`: no email of its own yet, with Connect email;
 * - `off`: it can't go, and why.
 */
export type EmailView =
    | { kind: "receipt"; off: ShareOff | null }
    | {
          kind: "send" | "remind";
          to: string | null;
          threadOnly: boolean;
          off: ShareOff | null;
      }
    | { kind: "noProvider" }
    | { kind: "off"; reason: string };

export function emailView(
    i: ShareInvoice,
    can: ShareCan,
    retryAt: string | null,
    /** The business's own email is connected; unknown: offered, and the API says. */
    emailConnected: boolean | undefined,
    now: Date = new Date(),
): EmailView {
    const refused = shareRefusal(i);
    if (refused) return { kind: "off", reason: refused };
    if (!can.write) return { kind: "off", reason: CANT_SHARE };
    if (i.standing === "PAID") {
        if (emailConnected === false) return { kind: "noProvider" };
        return { kind: "receipt", off: null };
    }
    const send = i.send;
    if (!send) {
        return {
            kind: "off",
            reason: "Email isn't offered for this invoice.",
        };
    }
    if (charging(i)) return { kind: "off", reason: AUTOPAY_HOLD };
    if (send.channels.length === 0) {
        if (send.reason === "NO_EMAIL_ADDRESS") {
            return { kind: "off", reason: NO_EMAIL_ADDRESS };
        }
        return { kind: "noProvider" };
    }
    const reminding = wasSent(i.sent);
    const at = reminding ? reminderWaits(i, retryAt, now) : null;
    return {
        kind: reminding ? "remind" : "send",
        to: send.emailTo ?? null,
        threadOnly: !send.channels.includes("email"),
        off: at ? { reason: "", retryAt: at } : null,
    };
}

/** The PDF tab: Download wants a number; Print draws the paper as it is. */
export function pdfOffered(i: ShareInvoice): boolean {
    return hasPdf(i);
}

/** Whether a PDF download or a print is logged: only where a share could be. */
export function logsPaper(i: ShareInvoice, can: ShareCan): boolean {
    return can.write && shareRefusal(i) === null;
}
