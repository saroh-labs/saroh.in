import type { InvoiceEvent } from "./service";

/**
 * The words for one line of an invoice's history (automatic notices U9
 * #1140): who did it, and where it went. "Sent by Ravi to
 * asha@example.com", "Reminder sent automatically to asha@example.com".
 * A person whose name isn't known is left out rather than guessed: "Sent
 * to asha@example.com". The date is drawn under the line, not here.
 */

/** " by Ravi", or nothing when it wasn't a person or the name is unknown. */
export function byWhom(e: Pick<InvoiceEvent, "actor">): string {
    return e.actor.kind === "USER" && e.actor.name ? ` by ${e.actor.name}` : "";
}

/** Where a send went: the address, their Messages, or both. */
function where(e: InvoiceEvent): string {
    if (e.channel === "THREAD") return " to their Messages";
    const to = e.to ? ` to ${e.to}` : "";
    return e.thread ? `${to} and to their Messages` : to;
}

/** Which email a failed send was. */
function failedWhat(template: string | null): string {
    switch (template) {
        case "INVOICE_REMINDER":
            return "Reminder";
        case "INVOICE_PAYMENT_RECEIVED":
            return "Receipt";
        default:
            return "Invoice";
    }
}

/**
 * Why Saroh couldn't send a renewal's invoice by itself (automatic notices
 * U10): the API's code for it. A failed send with no code is an email the
 * provider refused.
 */
function notSentWhy(reason: string): string {
    switch (reason) {
        case "NO_EMAIL_PROVIDER":
            return "no email provider is connected";
        case "NO_EMAIL_ADDRESS":
            return "there's no email address for them";
        case "BUSINESS_DETAILS_MISSING":
            return "your business details aren't complete";
        default:
            return "it couldn't be sent";
    }
}

/**
 * One event's line. `issuedAs` is how the paper says it was issued when
 * Saroh issued it (" by the subscription renewal"), so the old line keeps
 * its words.
 */
export function eventLine(
    e: InvoiceEvent,
    number: string | null,
    issuedAs = "",
): string {
    const by = byWhom(e);
    switch (e.kind) {
        case "ISSUED":
            return e.actor.kind === "USER"
                ? `${number ?? "It"} issued${by}`
                : `${number ?? "It"} issued${issuedAs || " automatically"}`;
        case "SENT":
        case "REMINDED": {
            const what = e.kind === "REMINDED" ? "Reminder" : "Invoice";
            if (e.status === "SUPPRESSED" && e.channel !== "THREAD") {
                return `${what} not sent to ${e.to ?? "them"}: they've turned off email from you`;
            }
            return e.kind === "REMINDED"
                ? `Reminder sent${by}${where(e)}`
                : `Sent${by}${where(e)}`;
        }
        case "AUTO_SENT":
        case "AUTO_REMINDED": {
            const what = e.kind === "AUTO_REMINDED" ? "Reminder" : "Invoice";
            if (e.status === "SUPPRESSED" && e.channel !== "THREAD") {
                return `${what} not sent automatically to ${e.to ?? "them"}: they've turned off email from you`;
            }
            return e.kind === "AUTO_REMINDED"
                ? `Reminder sent automatically${where(e)}`
                : `Sent automatically${where(e)}`;
        }
        case "SEND_FAILED":
            if (e.reason) {
                return `${failedWhat(e.template)} not sent automatically: ${notSentWhy(e.reason)}`;
            }
            return `${failedWhat(e.template)}${e.to ? ` to ${e.to}` : ""} didn't go: the email provider refused it`;
        case "VOIDED":
            return `Voided${by}${e.reason ? `: ${e.reason}` : ""}`;
        case "CREDITED":
            return `Credited${by}${e.creditNoteNumber ? ` with ${e.creditNoteNumber}` : ""}${e.reason ? `: ${e.reason}` : ""}`;
        case "REISSUED":
            return `Written again as a new draft${by}`;
        case "PAY_ATTEMPT_FAILED":
            return e.autopay
                ? "Autopay charge didn't go through"
                : "A payment on the pay page didn't go through";
        case "LINK_MADE":
            if (e.actor.kind === "CUSTOMER") {
                return "The customer asked for a new payment link";
            }
            return e.view ? `New link made${by}` : `New payment link made${by}`;
    }
}

/** A failed send or pay attempt reads as something gone wrong. */
export function eventIsBad(e: Pick<InvoiceEvent, "kind">): boolean {
    return e.kind === "SEND_FAILED" || e.kind === "PAY_ATTEMPT_FAILED";
}
