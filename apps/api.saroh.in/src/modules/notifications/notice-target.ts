/**
 * What an inbox notice opens (10 Oct 2026).
 *
 * Every notice is about one thing, and the inbox row is a link to it. So
 * every type is listed here with the kind of thing it opens, and a writer
 * builds its row's `type` and target columns with {@link noticeOf}, which
 * makes the target required for that type: `noticeOf("order.new", {})`
 * doesn't compile. A notice about a place rather than a record (the team,
 * the plan, the payment providers) opens that page and carries no id.
 *
 * A new notice type adds its line to {@link NOTICE_KINDS};
 * `notice-target.spec.ts` fails a `notification.create` that doesn't go
 * through `noticeOf`, and a type some module declares that isn't listed.
 *
 * Pure: no Prisma, so any module can import it.
 */

/** The kind of thing each notice type opens. */
export const NOTICE_KINDS = {
    "enquiry.new": "lead",
    "review.needs-reply": "review",
    "message.new": "contact",
    "order.new": "order",
    "order.uncollected": "order",
    "booking.new": "booking",
    "booking.moved": "booking",
    "booking.cancelled": "booking",
    "payment.failed": "invoice",
    "site.live": "site",
    "site.not_live": "site",
    "site.review.approved": "site",
    "site.review.changes": "site",
    "site.review.note": "site",
    // A custom domain may have lost its site: then it opens the websites.
    "domain.down": "domain",
    "domain.back": "domain",
    // Pages: there is no one record to open.
    "provider.attention": "providers",
    "provider.back": "providers",
    "team.joined": "team",
    "plan.limit": "plan",
    "plan.changed": "plan",
    "plan.ending": "plan",
    "plan.move": "plan",
    // Written by the catalogue backfill in `@saroh/database`.
    "catalogue.merge-report": "products",
} as const;

export type NoticeType = keyof typeof NOTICE_KINDS;
export type NoticeKind = (typeof NOTICE_KINDS)[NoticeType];

/** The columns a notice of each kind must set. */
interface TargetColumns {
    lead: { leadId: string };
    review: { reviewId: string };
    contact: { contactId: string; messageId: string };
    order: { orderId: string };
    booking: { bookingId: string };
    invoice: { invoiceId: string };
    site: { siteId: string };
    domain: { siteId: string | null };
    providers: Record<never, never>;
    team: Record<never, never>;
    plan: Record<never, never>;
    products: Record<never, never>;
}

/** What a notice of type `T` must point at. */
export type NoticeTargetOf<T extends NoticeType> =
    TargetColumns[(typeof NOTICE_KINDS)[T]];

/** The target columns of `Notification`, all of them. */
export interface NoticeColumns {
    leadId?: string;
    reviewId?: string;
    contactId?: string;
    messageId?: string;
    orderId?: string;
    bookingId?: string;
    invoiceId?: string;
    siteId?: string | null;
}

/** A notice's type with the target that type requires. */
export interface NoticeHead extends NoticeColumns {
    type: NoticeType;
}

/**
 * The `type` and target columns of a notice, to spread into
 * `notification.create`'s data. The target is required per type.
 */
export function noticeOf<T extends NoticeType>(
    type: T,
    target: NoticeTargetOf<T>,
): NoticeHead {
    return { type, ...(target as NoticeColumns) };
}

export function isNoticeType(type: string): type is NoticeType {
    return Object.prototype.hasOwnProperty.call(NOTICE_KINDS, type);
}

/** The column each kind of record is kept in; a page keeps none. */
const COLUMN_OF: Partial<Record<NoticeKind, keyof NoticeColumns>> = {
    lead: "leadId",
    review: "reviewId",
    contact: "contactId",
    order: "orderId",
    booking: "bookingId",
    invoice: "invoiceId",
    site: "siteId",
};

/**
 * The same, for a writer that words many types and writes them in one
 * place (`tellTeam`): the type and target a worded alert carries, checked
 * as it is written. An unlisted type, or one whose record is missing,
 * throws, so the job fails loudly instead of writing a row that opens
 * nothing.
 */
export function noticeHeadOf(
    alert: { type: string } & NoticeColumns,
): NoticeHead {
    if (!isNoticeType(alert.type)) {
        throw new Error(
            `Notice type "${alert.type}" has no target: add it to NOTICE_KINDS.`,
        );
    }
    const column = COLUMN_OF[NOTICE_KINDS[alert.type]];
    if (column && !alert[column]) {
        throw new Error(
            `A "${alert.type}" notice must set ${column}: it has nothing to open.`,
        );
    }
    const head: NoticeHead = { type: alert.type };
    for (const key of TARGET_COLUMNS) {
        const value = alert[key];
        if (value) Object.assign(head, { [key]: value });
    }
    return head;
}

const TARGET_COLUMNS = [
    "leadId",
    "reviewId",
    "contactId",
    "messageId",
    "orderId",
    "bookingId",
    "invoiceId",
    "siteId",
] as const satisfies readonly (keyof NoticeColumns)[];

/** What the inbox is told a row opens: the kind, and the record's id. */
export interface NoticeTarget {
    kind: NoticeKind;
    /**
     * The record. Null for a page (the team, the plan), and for a row
     * written before its column existed: the app then opens the list.
     */
    id: string | null;
}

/** A stored notice's target columns. */
export interface StoredNotice {
    type: string;
    leadId?: string | null;
    reviewId?: string | null;
    contactId?: string | null;
    orderId?: string | null;
    bookingId?: string | null;
    invoiceId?: string | null;
    siteId?: string | null;
}

const ID_OF: Record<NoticeKind, (n: StoredNotice) => string | null> = {
    lead: (n) => n.leadId ?? null,
    review: (n) => n.reviewId ?? null,
    contact: (n) => n.contactId ?? null,
    order: (n) => n.orderId ?? null,
    booking: (n) => n.bookingId ?? null,
    invoice: (n) => n.invoiceId ?? null,
    site: (n) => n.siteId ?? null,
    domain: (n) => n.siteId ?? null,
    providers: () => null,
    team: () => null,
    plan: () => null,
    products: () => null,
};

/**
 * What a stored row opens. A type this build doesn't list (one a newer
 * build wrote) still opens what its columns say; with none, it reads as
 * null and the app opens Home rather than nothing.
 */
export function noticeTargetOf(notice: StoredNotice): NoticeTarget | null {
    if (isNoticeType(notice.type)) {
        const kind = NOTICE_KINDS[notice.type];
        return { kind, id: ID_OF[kind](notice) };
    }
    if (notice.orderId) return { kind: "order", id: notice.orderId };
    if (notice.bookingId) return { kind: "booking", id: notice.bookingId };
    if (notice.invoiceId) return { kind: "invoice", id: notice.invoiceId };
    if (notice.leadId) return { kind: "lead", id: notice.leadId };
    if (notice.reviewId) return { kind: "review", id: notice.reviewId };
    if (notice.contactId) return { kind: "contact", id: notice.contactId };
    if (notice.siteId) return { kind: "site", id: notice.siteId };
    return null;
}
