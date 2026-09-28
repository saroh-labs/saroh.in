/**
 * The transactional messages Saroh sends for a business (round-2 D17), each
 * a fixed template in the business's voice: the invoice ones here, and A14's
 * booking, order and waitlist notices, whose words live beside their
 * handler (`site-accounts/notify-templates.ts`).
 *
 * Transactional, not marketing (default 10): the customer asked for what
 * they are being told about, so no marketing opt-in is needed. A revoked
 * email consent still stops it (`communications.service.ts`).
 *
 * Everything a person or business typed is HTML-escaped. A secret link (an
 * invoice's pay link) is never rendered into the stored body: the body
 * holds {@link SECRET_LINK_SLOT}, and the send job puts the link in at the
 * moment it hands the email to the provider, so the Message row, which staff
 * with `message:read` can list, never carries the token.
 */

export const INVOICE_TEMPLATES = ["INVOICE_SENT", "INVOICE_REMINDER"] as const;
export type InvoiceTemplate = (typeof INVOICE_TEMPLATES)[number];

/**
 * A14's notices about a customer's own booking, order or waitlist place
 * (R15). Each is also the `event` of the SYSTEM thread message it writes.
 */
export const NOTICE_TEMPLATES = [
    "BOOKING_CONFIRMED",
    "BOOKING_MOVED",
    "BOOKING_CANCELLED",
    "ORDER_READY",
    "ORDER_HANDED_OVER",
    "WAITLIST_OFFER",
] as const;
export type NoticeTemplate = (typeof NOTICE_TEMPLATES)[number];

export const TRANSACTIONAL_TEMPLATES = [
    ...INVOICE_TEMPLATES,
    ...NOTICE_TEMPLATES,
] as const;
export type TransactionalTemplate = (typeof TRANSACTIONAL_TEMPLATES)[number];

export function isNoticeTemplate(value: unknown): value is NoticeTemplate {
    return (NOTICE_TEMPLATES as readonly unknown[]).includes(value);
}

/** Where a secret link goes in a stored body; filled in at send time. */
export const SECRET_LINK_SLOT = "{{secret_link}}";

/** What an invoice email says. Money and dates arrive formatted. */
export interface InvoiceMailVars {
    business: string;
    /** "Asha", or null when the bill-to has no name. */
    firstName: string | null;
    number: string;
    /** "₹2,400.00" */
    total: string;
    /** "3 Oct 2026", or null when it has no due date. */
    dueOn: string | null;
    /** Past its due date. */
    overdue: boolean;
}

export interface RenderedMessage {
    subject: string;
    /** HTML, with {@link SECRET_LINK_SLOT} where the pay link goes. */
    body: string;
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** The subject and body for one template. */
export function renderTransactional(
    template: InvoiceTemplate,
    vars: InvoiceMailVars,
): RenderedMessage {
    const business = escapeHtml(vars.business);
    const number = escapeHtml(vars.number);
    const total = escapeHtml(vars.total);
    const greeting = vars.firstName
        ? `Hi ${escapeHtml(vars.firstName)},`
        : "Hello,";
    const due = vars.dueOn ? escapeHtml(vars.dueOn) : null;
    const reminder = template === "INVOICE_REMINDER";

    const subject = reminder
        ? vars.overdue && vars.dueOn
            ? `Reminder: invoice ${vars.number} from ${vars.business} was due ${vars.dueOn}`
            : `Reminder: invoice ${vars.number} from ${vars.business}`
        : `Invoice ${vars.number} from ${vars.business}: ${vars.total}`;

    const lead = reminder
        ? vars.overdue && due
            ? `Invoice ${number} for ${total} was due on ${due} and hasn&#39;t been paid yet.`
            : `A reminder that invoice ${number} for ${total} is still to be paid${due ? `, by ${due}` : ""}.`
        : `${business} has sent you invoice ${number} for ${total}${due ? `, due ${due}` : ""}.`;

    const body = [
        `<p>${greeting}</p>`,
        `<p>${lead}</p>`,
        `<p>You can pay it by UPI or card here:<br><a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a></p>`,
        reminder
            ? `<p>If you&#39;ve already paid, thank you, and please ignore this.</p>`
            : "",
        `<p>${business}</p>`,
    ]
        .filter(Boolean)
        .join("\n");

    return { subject, body };
}

/** The stored body with the link put back, for the provider only. */
export function fillSecretLink(body: string, link: string): string {
    return body.split(SECRET_LINK_SLOT).join(escapeHtml(link));
}
