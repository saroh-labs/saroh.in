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

/**
 * F14's alerts to the business's own team (a new order, a booking, a failed
 * payment, someone joining), worded by `notifications/team-alert.handler.ts`
 * and sent only to the people who chose email for them.
 */
export const TEAM_TEMPLATES = ["TEAM_ALERT"] as const;
export type TeamTemplate = (typeof TEAM_TEMPLATES)[number];

/**
 * D14's autopay set-up link, sent when staff press "Send a set-up link" on
 * Subscription Detail: the provider's page to approve autopay on, as a
 * secret link like a pay link. And the note that staff cancelled their
 * autopay ("Cancel autopay"), which is also the `event` of the SYSTEM
 * thread message it writes where the account thread is live.
 */
export const AUTOPAY_TEMPLATES = [
    "AUTOPAY_SET_UP_LINK",
    "AUTOPAY_CANCELLED",
] as const;
export type AutopayTemplate = (typeof AUTOPAY_TEMPLATES)[number];

export const TRANSACTIONAL_TEMPLATES = [
    ...INVOICE_TEMPLATES,
    ...NOTICE_TEMPLATES,
    ...TEAM_TEMPLATES,
    ...AUTOPAY_TEMPLATES,
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

/** What the autopay set-up email says (D14). Money and dates arrive formatted. */
export interface AutopayLinkMailVars {
    business: string;
    /** "Asha", or null when there's no name. */
    firstName: string | null;
    plan: string;
    /** "UPI", "card", "bank account". */
    method: string;
    /** "₹3,800.00": the most one renewal may take. */
    limit: string;
    /** "₹1.00" when the method's approval takes a check (DEC-064), else null. */
    check: string | null;
    /** "6 Oct 2026": the link stops working after it. */
    expiresOn: string;
}

/**
 * The autopay set-up email (D14). It names only the method staff chose, and
 * says the ₹1 check before they meet it (DEC-064). The link is the
 * provider's page, put in at send time like a pay link.
 */
export function renderAutopaySetupLink(
    vars: AutopayLinkMailVars,
): RenderedMessage {
    const business = escapeHtml(vars.business);
    const plan = escapeHtml(vars.plan);
    const greeting = vars.firstName
        ? `Hi ${escapeHtml(vars.firstName)},`
        : "Hello,";
    const body = [
        `<p>${greeting}</p>`,
        `<p>${business} has sent you a link to turn on autopay for ${plan}. Once it&#39;s on, each renewal is paid from your ${escapeHtml(vars.method)}, up to ${escapeHtml(vars.limit)} a time. You can ask ${business} to cancel it whenever you like.</p>`,
        vars.check
            ? `<p>To switch it on, your bank needs a ${escapeHtml(vars.check)} check. It&#39;s refunded straight away and is back in your account in 5–7 working days.</p>`
            : "",
        `<p>Turn on autopay here:<br><a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a></p>`,
        `<p>The link works until ${escapeHtml(vars.expiresOn)}.</p>`,
        `<p>${business}</p>`,
    ]
        .filter(Boolean)
        .join("\n");
    return {
        subject: `Turn on autopay for ${vars.plan} with ${vars.business}`,
        body,
    };
}

/** What the autopay-cancelled note says (D14). */
export interface AutopayCancelledVars {
    business: string;
    /** "Asha", or null when there's no name. */
    firstName: string | null;
    plan: string;
}

/**
 * The line in the customer's account thread when staff cancel their
 * autopay (D14). Plain text: a thread message is never rendered as HTML.
 */
export function autopayCancelledSentence(vars: AutopayCancelledVars): string {
    return `${vars.business} turned off autopay for ${vars.plan}. Nothing more is taken automatically — your next renewal comes as an invoice with a link to pay.`;
}

/**
 * The email when staff cancel a customer's autopay (D14): it stopped, the
 * plan carries on, and how the next renewal is paid. Sent through D17's
 * transactional path, so a revoked email consent still stops it.
 */
export function renderAutopayCancelled(
    vars: AutopayCancelledVars,
): RenderedMessage {
    const business = escapeHtml(vars.business);
    const plan = escapeHtml(vars.plan);
    const greeting = vars.firstName
        ? `Hi ${escapeHtml(vars.firstName)},`
        : "Hello,";
    const body = [
        `<p>${greeting}</p>`,
        `<p>${business} has turned off autopay for ${plan}. Nothing more will be taken automatically.</p>`,
        `<p>Your plan carries on. From your next renewal, ${business} sends you an invoice with a link to pay it.</p>`,
        `<p>${business}</p>`,
    ].join("\n");
    return {
        subject: `Autopay for ${vars.plan} is off`,
        body,
    };
}

/** The stored body with the link put back, for the provider only. */
export function fillSecretLink(body: string, link: string): string {
    return body.split(SECRET_LINK_SLOT).join(escapeHtml(link));
}
