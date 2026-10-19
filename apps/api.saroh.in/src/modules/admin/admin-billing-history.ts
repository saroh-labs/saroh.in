import { moneyWordsMinor } from "../../common/words-format";

/**
 * A subscription's history in words (admin plan U15, R27): one timeline
 * merged from what the billing provider sent, the invoices Saroh issued,
 * the billing emails Saroh sent or has waiting, and what staff (or Saroh
 * itself) did to the business. Pure: the service reads the rows, this
 * names them and merges them newest first.
 *
 * A provider event is named from its type and its ids only. Its payload is
 * the provider's whole message and never comes here (the service never
 * selects it).
 */

/** What a row is, for its tag and the filter chips. */
export type HistoryKind = "provider" | "invoice" | "email" | "staff";

/** The chips: Everything · Provider events · Invoices · Saroh and staff. */
export const HISTORY_SHOWS = [
    "everything",
    "provider",
    "invoices",
    "saroh",
] as const;
export type HistoryShow = (typeof HISTORY_SHOWS)[number];

/** Which kinds each chip shows. */
export const SHOW_KINDS: Record<HistoryShow, readonly HistoryKind[]> = {
    everything: ["provider", "invoice", "email", "staff"],
    provider: ["provider"],
    invoices: ["invoice"],
    saroh: ["email", "staff"],
};

/** One line of the timeline. */
export interface BillingHistoryRow {
    /** Unique across the sources: "<source>:<row id>". */
    id: string;
    /** When it happened, ISO. */
    at: string;
    kind: HistoryKind;
    title: string;
    /** A second line, or null when the title says it all. */
    line: string | null;
    /**
     * Ids beside what they are. A provider event's are "What Razorpay
     * sent": its type and event id, never anything from its payload.
     */
    refs: Record<string, string>;
}

export interface BillingHistoryPage {
    items: BillingHistoryRow[];
    page: number;
    limit: number;
    hasMore: boolean;
    show: HistoryShow;
}

export const HISTORY_PAGE_SIZE = 50;
/** The furthest page: each source reads `page × limit` rows to merge. */
export const HISTORY_MAX_PAGE = 40;

// ── Provider events ──────────────────────────────────────────────────────

const PROVIDER_EVENT_WORDS: Record<string, string> = {
    "subscription.authenticated": "Autopay approved by the business",
    "subscription.activated": "Autopay started",
    "subscription.charged": "Razorpay charged the plan",
    "subscription.pending": "A charge failed; Razorpay will try again",
    "subscription.halted": "Razorpay gave up charging",
    "subscription.cancelled": "Autopay cancelled",
    "subscription.completed": "Autopay ran its course",
    "subscription.expired": "Autopay expired",
    "subscription.resumed": "Autopay resumed",
    "subscription.paused": "Autopay paused",
    "subscription.updated": "Autopay changed",
    "order.paid": "A one-time payment came in",
    "payment.captured": "A payment came in",
    "payment.failed": "A payment failed",
    "refund.created": "A refund started",
    "refund.processed": "A refund reached the business",
    "refund.failed": "A refund failed",
    "payment.dispute.created": "The business disputed a payment",
    "payment.dispute.won": "A dispute was won",
    "payment.dispute.lost": "A dispute was lost",
    "payment.dispute.closed": "A dispute was closed",
};

/** "subscription.charged" in words; an unknown type as it came. */
export function providerEventTitle(type: string): string {
    return PROVIDER_EVENT_WORDS[type] ?? `Razorpay sent ${type}`;
}

export function providerEventRow(e: {
    id: string;
    provider: string;
    providerEventId: string;
    type: string;
    receivedAt: Date;
    processedAt: Date | null;
}): BillingHistoryRow {
    return {
        id: `provider:${e.id}`,
        at: e.receivedAt.toISOString(),
        kind: "provider",
        title: providerEventTitle(e.type),
        line: e.processedAt
            ? "Saroh applied it."
            : "Not applied yet: Saroh hasn't acted on it.",
        refs: {
            provider: e.provider,
            type: e.type,
            event: e.providerEventId,
        },
    };
}

// ── Invoices ─────────────────────────────────────────────────────────────

const INVOICE_SOURCE_WORDS: Record<string, string> = {
    NEW: "a new plan",
    UPGRADE: "a move up",
    SCHEDULED: "a scheduled move",
    RENEWAL: "a renewal",
};

interface InvoiceForHistory {
    id: string;
    number: string;
    issuedAt: Date;
    emailedAt: Date | null;
    source: string;
    planName: string;
    totalPaise: number;
    currency: string;
    provider: string;
    providerPaymentId: string | null;
}

function invoiceRefs(i: InvoiceForHistory): Record<string, string> {
    return {
        provider: i.provider,
        invoice: i.number,
        ...(i.providerPaymentId ? { payment: i.providerPaymentId } : {}),
    };
}

export function invoiceIssuedRow(i: InvoiceForHistory): BillingHistoryRow {
    const why = INVOICE_SOURCE_WORDS[i.source];
    return {
        id: `invoice:${i.id}`,
        at: i.issuedAt.toISOString(),
        kind: "invoice",
        title: `Invoice ${i.number} issued`,
        line: `${moneyWordsMinor(i.totalPaise, i.currency)} for ${i.planName}${why ? `, ${why}` : ""}.`,
        refs: invoiceRefs(i),
    };
}

/** The invoice's own email (`emailedAt`): it claims no CustomerNotice. */
export function invoiceEmailedRow(i: InvoiceForHistory): BillingHistoryRow {
    return {
        id: `invoice-email:${i.id}`,
        at: (i.emailedAt ?? i.issuedAt).toISOString(),
        kind: "email",
        title: `Emailed invoice ${i.number}`,
        line: "Sent to the people who manage its billing, with the PDF.",
        refs: invoiceRefs(i),
    };
}

// ── Billing emails ───────────────────────────────────────────────────────

/** A billing email by its notice key's word or its job's kind. */
const EMAIL_WORDS: Record<string, string> = {
    "payment-failed": "a payment failed",
    PAYMENT_FAILED: "a payment failed",
    "trial-ending": "the free trial is ending",
    TRIAL_ENDING: "the free trial is ending",
    renewal: "the plan renews soon",
    RENEWAL: "the plan renews soon",
    "plan-ending": "the plan is ending",
    PLAN_ENDING: "the plan is ending",
    "term-ending": "the autopay is running out",
    TERM_ENDING: "the autopay is running out",
    "price-change": "the price is changing",
    PRICE_CHANGE: "the price is changing",
    "autopay-ended": "the autopay was ended",
    AUTOPAY_ENDED: "the autopay was ended",
    refunded: "the double charge was refunded",
    DOUBLE_CHARGE_REFUNDED: "the double charge was refunded",
    "move-down": "the move to a lower plan",
    MOVE_DOWN: "the move to a lower plan",
    domain: "the business's own domain",
    DOMAIN: "the business's own domain",
    INVOICE: "an invoice",
};

/** "saroh-billing:payment-failed:…" → "a payment failed". */
export function noticeAbout(eventKey: string): string | null {
    const parts = eventKey.split(":");
    const word = parts[0] === "saroh-billing" ? parts[1] : parts[0];
    if (!word) return null;
    if (EMAIL_WORDS[word]) return EMAIL_WORDS[word];
    // Some kinds carry their own key ("move-down-…", "domain-…").
    for (const [key, words] of Object.entries(EMAIL_WORDS)) {
        if (key === key.toLowerCase() && word.startsWith(key)) return words;
    }
    return null;
}

export function noticeRow(n: {
    id: string;
    eventKey: string;
    createdAt: Date;
}): BillingHistoryRow {
    const about = noticeAbout(n.eventKey);
    return {
        id: `notice:${n.id}`,
        at: n.createdAt.toISOString(),
        kind: "email",
        title: about ? `Emailed: ${about}` : "Billing email sent",
        line: "Sent to the people who manage its billing.",
        refs: {},
    };
}

/**
 * A billing email still waiting, or one that failed or was cancelled. A
 * sent one is its notice (or its invoice's `emailedAt`), so a DONE job is
 * not read: it would say the same thing twice.
 */
export function emailJobRow(j: {
    id: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    /** Only the payload's `kind`, never the rest of it. */
    emailKind: string | null;
}): BillingHistoryRow {
    const about = j.emailKind ? EMAIL_WORDS[j.emailKind] : undefined;
    const what = about ? `: ${about}` : "";
    const tries = `Tried ${j.attempts} of ${j.maxAttempts} times.`;
    const [title, line] =
        j.status === "FAILED"
            ? [
                  `Email failed to send${what}`,
                  `${tries} It won't be tried again.`,
              ]
            : j.status === "CANCELLED"
              ? [`Email cancelled${what}`, "Staff cancelled it before it went."]
              : [
                    `Email waiting to send${what}`,
                    j.attempts > 0 ? `${tries} It is tried again.` : null,
                ];
    return {
        id: `job:${j.id}`,
        at: j.createdAt.toISOString(),
        kind: "email",
        title,
        line,
        refs: {},
    };
}

/** The `kind` of a billing email job's payload; nothing else is read. */
export function emailKindOf(payload: unknown): string | null {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const kind = (payload as Record<string, unknown>).kind;
        if (typeof kind === "string" && /^[A-Z_]{1,40}$/.test(kind)) {
            return kind;
        }
    }
    return null;
}

// ── Staff and Saroh ──────────────────────────────────────────────────────

const AUDIT_WORDS: Record<string, string> = {
    "billing.autopay.ended": "Autopay ended by staff",
    "billing.refund.recorded": "A refund made by hand was recorded",
    "billing.refund.recheck": "The refund was checked again",
    "billing.profile.sync": "The Razorpay customer was synced again",
    "billing.action.resolved": "A Needs-action row was resolved",
    "billing.double_charge.refund": "Saroh found a double charge",
    "billing.double_charge.refunded": "Saroh refunded the double charge",
    "organization.override.revoked": "An offer was taken back",
};

/** An action in words; one not named here as it was written. */
export function auditTitle(action: string): string {
    return AUDIT_WORDS[action] ?? action;
}

export function auditRow(
    a: {
        id: string;
        action: string;
        actorUserId: string;
        reason: string | null;
        outcome: string;
        targetId: string | null;
        createdAt: Date;
    },
    actorName: string,
): BillingHistoryRow {
    const refused =
        a.outcome === "DENIED"
            ? " (refused)"
            : a.outcome === "FAILURE"
              ? " (didn't finish)"
              : "";
    return {
        id: `audit:${a.id}`,
        at: a.createdAt.toISOString(),
        kind: "staff",
        title: `${auditTitle(a.action)}${refused}`,
        line: a.reason ? `${actorName}: ${a.reason}` : actorName,
        refs: {
            action: a.action,
            ...(a.targetId && PROVIDER_ID_LIKE.test(a.targetId)
                ? { target: a.targetId }
                : {}),
        },
    };
}

/** A billing provider's id, worth showing beside a staff action. */
const PROVIDER_ID_LIKE = /^(pay|sub|cust|order|rfnd|inv|disp)_[A-Za-z0-9]+$/;

// ── Merge ────────────────────────────────────────────────────────────────

/** Newest first; the same moment in a fixed order, by id. */
export function byNewest(a: BillingHistoryRow, b: BillingHistoryRow): number {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * One page of the merged timeline. Each source was read newest first, at
 * most `page × limit + 1` rows, so the first `page × limit` merged rows
 * are exactly the timeline's first `page` pages.
 */
export function mergeHistory(
    sources: BillingHistoryRow[][],
    page: number,
    limit: number,
): { items: BillingHistoryRow[]; hasMore: boolean } {
    const all = sources.flat().sort(byNewest);
    const start = (page - 1) * limit;
    return {
        items: all.slice(start, start + limit),
        hasMore: all.length > start + limit,
    };
}
