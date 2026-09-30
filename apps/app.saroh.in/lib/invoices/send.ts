import type {
    InvoiceOnline,
    InvoiceSend,
    InvoiceSent,
    SendResult,
} from "./service";

/**
 * The words around sending an invoice (D17). The API decides which channels
 * can carry it (`invoice.send`); these only say it, the same way on Invoice
 * Detail and, later, Home's Send reminder (F4).
 */

/**
 * Whether its link takes payment (DEC-070): the API's `payOnline` on the
 * send view — Payments on, and a provider that can take the money.
 * Otherwise the link only shows the invoice, and there is no pay link to
 * copy. An API from before DEC-070 sends no `payOnline`; a connected
 * provider answered then, and still does for it.
 */
export function paysOnline(
    send: Pick<InvoiceSend, "payOnline"> | undefined | null,
    online: Pick<InvoiceOnline, "providerConnected"> | undefined | null,
): boolean {
    return send?.payOnline ?? online?.providerConnected ?? false;
}

/** "Send with pay link" where the link takes payment, else "Send invoice". */
export function sendLabel(payOnline: boolean): string {
    return payOnline ? "Send with pay link" : "Send invoice";
}

/** Whether Send (or Send reminder) is offered at all. */
export function canSend(send: InvoiceSend | undefined | null): boolean {
    return (send?.channels.length ?? 0) > 0;
}

/** It has gone once already (or is going), so the next is a reminder. */
export function wasSent(sent: InvoiceSent[] | undefined): boolean {
    return (sent ?? []).some(
        (s) => s.status === "QUEUED" || s.status === "SENT",
    );
}

/** "by email at asha@…", "in their account on your site", or both. */
function where(send: InvoiceSend): string {
    const email = send.channels.includes("email");
    const thread = send.channels.includes("thread");
    const byEmail = `by email${send.emailTo ? ` at ${send.emailTo}` : ""}`;
    if (email && thread) return `${byEmail} and in their account on your site`;
    if (thread) return "in their account on your site";
    return byEmail;
}

/**
 * The confirm's sentence: who is told, where, and what happens to a link
 * already shared.
 */
export function sendConfirmLine(
    send: InvoiceSend,
    first: string,
    total: string,
    reminder: boolean,
): string {
    const what = reminder
        ? `This reminds ${first} ${where(send)} that ${total} is still to pay`
        : `This tells ${first} ${where(send)} about ${total}`;
    const pay = send.payOnline ?? true;
    if (!send.channels.includes("email")) {
        return pay ? `${what}, with a way to pay it.` : `${what}.`;
    }
    return pay
        ? `${what}, with a new pay link. A link you shared before stops working.`
        : `${what}, with a link to view it and download a copy. A link you shared before stops working.`;
}

/** The toast after a send, and whether it is bad news. */
export function sendOutcome(
    result: SendResult,
    first: string,
    reminder: boolean,
    /** The link went as a pay link (`payOnline`); false, a view link. */
    payOnline = true,
): { message: string; ok: boolean } {
    if (result.email?.status === "SUPPRESSED") {
        return {
            ok: false,
            message: result.thread
                ? `Posted to ${first}'s account. Not emailed: ${first} has turned off email from you.`
                : payOnline
                  ? `Not sent: ${first} has turned off email from you. Copy the pay link and share it another way.`
                  : `Not sent: ${first} has turned off email from you. Download the PDF and share it another way.`,
        };
    }
    const noun = reminder ? "Reminder sent" : "Sent";
    if (result.email && result.thread) {
        return {
            ok: true,
            message: `${noun} to ${result.email.to} and posted to ${first}'s account.`,
        };
    }
    if (result.email) {
        return {
            ok: true,
            message: payOnline
                ? `${noun} to ${result.email.to} with a pay link.`
                : `${noun} to ${result.email.to}.`,
        };
    }
    return { ok: true, message: `Posted to ${first}'s account.` };
}

/** One line of "What happened" for a send. */
export function sentLine(s: InvoiceSent): string {
    const what = s.reminder ? "Reminder" : "Invoice";
    switch (s.status) {
        case "SUPPRESSED":
            return `${what} not sent to ${s.to}: they've turned off email from you`;
        case "FAILED":
            return `${what} to ${s.to} didn't go: the email provider refused it`;
        default:
            return s.reminder ? `Reminder sent to ${s.to}` : `Sent to ${s.to}`;
    }
}
