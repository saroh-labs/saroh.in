/**
 * A customer's message thread on Customer Detail (round-2 A13): the shapes
 * the API sends (`site-accounts/threads.service.ts`, `StaffThread`) and the
 * words the Messages tab says. Pure: no fetching here.
 */

export type ThreadAuthor = "CUSTOMER" | "STAFF" | "SYSTEM";

export interface ThreadMessage {
    id: string;
    author: ThreadAuthor;
    body: string;
    at: string;
    /** The staff member who wrote it; null for the customer or Saroh. */
    by: string | null;
    /** The viewer wrote it. */
    mine: boolean;
    /** What a Saroh post says happened (INVOICE_SENT, …), and its invoice. */
    event: string | null;
    invoiceId: string | null;
}

export interface CustomerThread {
    messages: ThreadMessage[];
    earlier: boolean;
    /** From the customer, since the team last opened it. */
    unread: number;
    /** They have a live site account, so they'll see a reply. */
    signsIn: boolean;
    /** The viewer may answer (`message:write`). */
    canReply: boolean;
}

/** The longest reply the API takes (`MESSAGE_MAX`). */
export const REPLY_MAX = 2_000;

const EVENT_WORDS = new Map([
    ["INVOICE_SENT", "Invoice sent"],
    ["INVOICE_REMINDER", "Invoice reminder"],
]);

/**
 * Who a message is from, as the tab labels it: the customer by first name,
 * "You" for the viewer's own, a teammate by first name, and an automatic
 * post by what it was ("Invoice sent", from Invoice Detail's Send).
 */
export function messageFrom(
    m: Pick<ThreadMessage, "author" | "by" | "mine" | "event">,
    customerFirstName: string,
): string {
    if (m.author === "CUSTOMER") return customerFirstName;
    if (m.author === "SYSTEM") {
        return EVENT_WORDS.get(m.event ?? "") ?? "Automatic message";
    }
    if (m.mine) return "You";
    return m.by?.trim().split(/\s+/)[0] ?? "The team";
}

/**
 * The line under the reply box: where the answer goes. Honest about the
 * one thing that is sent — a message in their account on the business's
 * site — and about a customer who hasn't signed in there.
 */
export function replyNote(signsIn: boolean, firstName: string): string {
    return signsIn
        ? `${firstName} sees your reply in Messages when they're signed in on your site. Nothing is emailed or texted.`
        : `${firstName} doesn't sign in on your site yet. They'll see it when they sign in on your site.`;
}

/** The tab's empty state. */
export function emptyThreadText(signsIn: boolean, firstName: string): string {
    return signsIn
        ? `${firstName} hasn't written yet. When they message you from their account on your site, it shows here.`
        : `${firstName} doesn't sign in on your site, so there are no messages. Once they do, they can write to you from their account.`;
}
