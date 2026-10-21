import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import { allows, authorize } from "../organizations/organization-policy";

type Db = Prisma.TransactionClient;

/**
 * An invoice's history (automatic notices U9 #1140, DEC-174): who issued,
 * sent, reminded, voided or credited it, and when — including what Saroh
 * did on the business's behalf, which `AuditEvent` (its actor is required)
 * can't hold.
 *
 * Each change writes its row in its own transaction, so the history never
 * shows a change that rolled back. Payments stay the ledger's audit rows
 * (`invoice-payment-events.ts`) and shares by hand stay `InvoiceShare`:
 * {@link readInvoiceHistory} merges the three, so nothing is written twice.
 * There is no backfill: an older invoice reads its history from its own
 * dates (issued, paid, voided) and its emails, without names (A16).
 */

export const INVOICE_EVENT_KINDS = [
    "ISSUED",
    "SENT",
    "REMINDED",
    "AUTO_SENT",
    "AUTO_REMINDED",
    "SEND_FAILED",
    "VOIDED",
    "CREDITED",
    "REISSUED",
    "PAY_ATTEMPT_FAILED",
    "LINK_MADE",
] as const;
export type InvoiceEventKind = (typeof INVOICE_EVENT_KINDS)[number];

/** Who did it: a person, Saroh on the business's behalf, or the customer. */
export type InvoiceActor =
    { kind: "USER"; userId: string } | { kind: "JOB" } | { kind: "CUSTOMER" };

export const JOB_ACTOR: InvoiceActor = { kind: "JOB" };
export const CUSTOMER_ACTOR: InvoiceActor = { kind: "CUSTOMER" };

/** The person acting in a workspace request. */
export function personActor(ctx: Pick<OrganizationContext, "userId">) {
    return { kind: "USER", userId: ctx.userId } as const satisfies InvoiceActor;
}

/** A person when one is named, else Saroh (a renewal, a job). */
export function actorOrJob(userId: string | null | undefined): InvoiceActor {
    return userId ? { kind: "USER", userId } : JOB_ACTOR;
}

export type InvoiceEventChannel = "EMAIL" | "THREAD";

/**
 * Small context kept with an event: never a token, and nothing a reader
 * of the invoice couldn't already see.
 */
export interface InvoiceEventData {
    /** The address a send went to. */
    to?: string;
    /** QUEUED, or SUPPRESSED when the customer had turned email off. */
    status?: "QUEUED" | "SUPPRESSED";
    /** An email send also posted to the customer's account thread. */
    thread?: boolean;
    /** Why: a void's reason, a credit's reason, a failed charge's. */
    reason?: string;
    /** A credit: the credit note it made. */
    creditNoteId?: string;
    creditNoteNumber?: string | null;
    /** Written again: the draft that replaced it. */
    draftId?: string;
    /** A failed send: which email it was. */
    template?: string;
    /** A failed pay attempt by autopay rather than on the pay page. */
    autopay?: boolean;
    /** A link that only shows the invoice, not a pay link. */
    view?: boolean;
}

export interface RecordInvoiceEvent {
    organizationId: string;
    invoiceId: string;
    kind: InvoiceEventKind;
    actor: InvoiceActor;
    channel?: InvoiceEventChannel | null;
    messageId?: string | null;
    data?: InvoiceEventData;
}

/**
 * Write one event on the caller's transaction. An event naming a message
 * is written once per message and kind (a retried job's failure is one
 * line), so it is skipped rather than refused when it is already there.
 */
export async function recordInvoiceEvent(
    tx: Db,
    event: RecordInvoiceEvent,
): Promise<void> {
    await tx.invoiceEvent.createMany({
        data: [
            {
                organizationId: event.organizationId,
                invoiceId: event.invoiceId,
                kind: event.kind,
                actorKind: event.actor.kind,
                actorUserId:
                    event.actor.kind === "USER" ? event.actor.userId : null,
                channel: event.channel ?? null,
                messageId: event.messageId ?? null,
                ...(event.data
                    ? { data: event.data as Prisma.InputJsonObject }
                    : {}),
            },
        ],
        skipDuplicates: true,
    });
}

/** The invoice emails a failed send is told for. */
const INVOICE_EMAILS = new Set([
    "INVOICE_SENT",
    "INVOICE_REMINDER",
    "INVOICE_PAYMENT_RECEIVED",
]);

/**
 * An invoice's email didn't go and won't be tried again (the provider
 * refused it, there was no provider, its link was missing): SEND_FAILED on
 * the invoice, once per email. Any other message is left alone. Called by
 * the `message.send` handler after it marks the message FAILED; never
 * throws, so the handler's own outcome stands.
 */
export async function recordInvoiceSendFailed(
    messageId: string,
): Promise<void> {
    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
            organizationId: true,
            invoiceId: true,
            template: true,
            toAddress: true,
        },
    });
    if (!message?.invoiceId || !INVOICE_EMAILS.has(message.template ?? "")) {
        return;
    }
    const invoiceId = message.invoiceId;
    await prisma.$transaction((tx) =>
        recordInvoiceEvent(tx, {
            organizationId: message.organizationId,
            invoiceId,
            kind: "SEND_FAILED",
            actor: JOB_ACTOR,
            channel: "EMAIL",
            messageId,
            data: {
                to: message.toAddress,
                template: message.template ?? undefined,
            },
        }),
    );
}

// — reading ———————————————————————————————————————————————————————

export interface InvoiceActorView {
    kind: "USER" | "JOB" | "CUSTOMER";
    /** The person, when one did it; null for Saroh or the customer. */
    userId: string | null;
    /** Their name now; null when unknown (left, or never named). */
    name: string | null;
}

/** One {@link InvoiceEventKind} row, as the invoice read serves it. */
export interface InvoiceEventView {
    id: string;
    kind: InvoiceEventKind;
    at: string;
    actor: InvoiceActorView;
    channel: InvoiceEventChannel | null;
    messageId: string | null;
    to: string | null;
    /** QUEUED or SUPPRESSED on a send; null otherwise. */
    status: string | null;
    thread: boolean;
    reason: string | null;
    creditNoteId: string | null;
    creditNoteNumber: string | null;
    draftId: string | null;
    template: string | null;
    autopay: boolean;
    view: boolean;
}

/** At most this many events on the invoice read: newest first. */
export const EVENTS_ON_READ = 50;

/** Names for the people behind a set of rows, read once. */
async function namesOf(
    db: Db,
    ids: readonly (string | null | undefined)[],
): Promise<Map<string, string | null>> {
    const wanted = [
        ...new Set(ids.filter((id): id is string => !!id && !isSystem(id))),
    ];
    if (wanted.length === 0) return new Map();
    const users = await db.user.findMany({
        where: { id: { in: wanted } },
        select: { id: true, name: true },
    });
    // A blank name is no name: the line then names no one.
    return new Map(
        users.map((u) => {
            const name = u.name?.trim() ?? "";
            return [u.id, name.length > 0 ? name : null];
        }),
    );
}

/** An audit actor that is Saroh, not a person: `system:<what>`. */
function isSystem(actorUserId: string): boolean {
    return actorUserId.startsWith("system:");
}

function actorView(
    kind: string,
    userId: string | null,
    names: Map<string, string | null>,
): InvoiceActorView {
    const k = kind === "USER" || kind === "CUSTOMER" ? kind : "JOB";
    return {
        kind: k,
        userId: k === "USER" ? userId : null,
        name: k === "USER" && userId ? (names.get(userId) ?? null) : null,
    };
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** An invoice's own events, newest first, each with who did it. */
export async function readInvoiceEvents(
    db: Db,
    organizationId: string,
    invoiceId: string,
    take = EVENTS_ON_READ,
): Promise<InvoiceEventView[]> {
    const rows = await db.invoiceEvent.findMany({
        where: { organizationId, invoiceId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
    });
    const names = await namesOf(
        db,
        rows.map((r) => r.actorUserId),
    );
    return rows.map((r) => {
        const d = (r.data ?? {}) as Record<string, unknown>;
        return {
            id: r.id,
            kind: r.kind as InvoiceEventKind,
            at: r.createdAt.toISOString(),
            actor: actorView(r.actorKind, r.actorUserId, names),
            channel: (r.channel as InvoiceEventChannel | null) ?? null,
            messageId: r.messageId,
            to: str(d.to),
            status: str(d.status),
            thread: d.thread === true,
            reason: str(d.reason),
            creditNoteId: str(d.creditNoteId),
            creditNoteNumber: str(d.creditNoteNumber),
            draftId: str(d.draftId),
            template: str(d.template),
            autopay: d.autopay === true,
            view: d.view === true,
        };
    });
}

/** Names for the people who shared an invoice by hand. */
export async function shareNames(
    db: Db,
    userIds: readonly (string | null)[],
): Promise<Map<string, string | null>> {
    return namesOf(db, userIds);
}

/**
 * One line of `GET :invoiceId/history`:
 * - `EVENT`: an {@link InvoiceEventView};
 * - `SHARE`: shared by hand (WhatsApp, link, PDF, print), with who;
 * - `PAYMENT`: the ledger's audit row (recorded, removed, a cheque in the
 *   bank or bounced), its amount only with `payment:read` (DEC-098);
 * - `EMAIL`: an invoice email from before the history began, named by
 *   who queued it;
 * - `DATE`: an older invoice's own date (issued, paid, voided), no name.
 */
export type InvoiceHistoryEntry =
    | ({ source: "EVENT" } & InvoiceEventView)
    | {
          source: "SHARE";
          id: string;
          kind: "SHARED";
          at: string;
          actor: InvoiceActorView;
          channel: string;
          message: string;
      }
    | {
          source: "PAYMENT";
          id: string;
          kind:
              | "PAYMENT_RECORDED"
              | "PAYMENT_REMOVED"
              | "CHEQUE_CLEARED"
              | "CHEQUE_BOUNCED";
          at: string;
          actor: InvoiceActorView;
          paymentId: string | null;
          method: string | null;
          /** Major units; absent without `payment:read`. */
          amount?: string;
          currency?: string;
      }
    | {
          source: "EMAIL";
          id: string;
          kind: "SENT" | "REMINDED";
          at: string;
          actor: InvoiceActorView;
          to: string;
          status: string;
      }
    | {
          source: "DATE";
          id: string;
          kind: "ISSUED" | "PAID" | "VOIDED";
          at: string;
          actor: InvoiceActorView;
      };

const PAYMENT_KINDS: Record<
    string,
    Extract<InvoiceHistoryEntry, { source: "PAYMENT" }>["kind"]
> = {
    [AuditAction.InvoicePaymentRecorded]: "PAYMENT_RECORDED",
    [AuditAction.InvoicePaymentRemoved]: "PAYMENT_REMOVED",
    [AuditAction.InvoiceChequeCleared]: "CHEQUE_CLEARED",
    [AuditAction.InvoiceChequeBounced]: "CHEQUE_BOUNCED",
};

/** How many of each kind the history reads: an invoice's whole life. */
const HISTORY_TAKE = 200;

const NO_ONE: InvoiceActorView = { kind: "JOB", userId: null, name: null };

/**
 * `GET :invoiceId/history`: everything that happened to one invoice,
 * newest first — its events, its shares by hand, its ledger's payment
 * rows, its emails from before events were written, and, for what no row
 * records, the invoice's own dates without a name. Another business's
 * invoice is a 404.
 */
export async function readInvoiceHistory(
    ctx: OrganizationContext,
    invoiceId: string,
): Promise<InvoiceHistoryEntry[]> {
    authorize(ctx, "invoice:read");
    const { organizationId } = ctx;
    const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        select: { issuedAt: true, paidAt: true, voidedAt: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    const money = allows(ctx, "payment:read");

    const [events, shares, audits, emails] = await Promise.all([
        readInvoiceEvents(prisma, organizationId, invoiceId, HISTORY_TAKE),
        prisma.invoiceShare.findMany({
            where: { organizationId, invoiceId },
            orderBy: { createdAt: "desc" },
            take: HISTORY_TAKE,
            select: {
                id: true,
                channel: true,
                kind: true,
                byUserId: true,
                createdAt: true,
            },
        }),
        prisma.auditEvent.findMany({
            where: {
                organizationId,
                targetType: "invoice",
                targetId: invoiceId,
                action: { in: Object.keys(PAYMENT_KINDS) },
            },
            orderBy: { createdAt: "desc" },
            take: HISTORY_TAKE,
            select: {
                id: true,
                action: true,
                actorUserId: true,
                metadata: true,
                createdAt: true,
            },
        }),
        prisma.message.findMany({
            where: {
                organizationId,
                invoiceId,
                template: { in: ["INVOICE_SENT", "INVOICE_REMINDER"] },
            },
            orderBy: { createdAt: "desc" },
            take: HISTORY_TAKE,
            select: {
                id: true,
                template: true,
                toAddress: true,
                status: true,
                createdByUserId: true,
                createdAt: true,
            },
        }),
    ]);
    const names = await namesOf(prisma, [
        ...shares.map((s) => s.byUserId),
        ...audits.map((a) => a.actorUserId),
        ...emails.map((m) => m.createdByUserId),
    ]);
    const person = (userId: string | null): InvoiceActorView =>
        userId && !isSystem(userId) ? actorView("USER", userId, names) : NO_ONE;

    const out: InvoiceHistoryEntry[] = events.map((e) => ({
        source: "EVENT" as const,
        ...e,
    }));
    for (const s of shares) {
        out.push({
            source: "SHARE",
            id: s.id,
            kind: "SHARED",
            at: s.createdAt.toISOString(),
            actor: person(s.byUserId),
            channel: s.channel,
            message: s.kind,
        });
    }
    for (const a of audits) {
        const m = (a.metadata ?? {}) as Record<string, unknown>;
        out.push({
            source: "PAYMENT",
            id: a.id,
            kind: PAYMENT_KINDS[a.action] ?? "PAYMENT_RECORDED",
            at: a.createdAt.toISOString(),
            actor: person(a.actorUserId),
            paymentId: str(m.paymentId),
            method: str(m.method),
            ...(money
                ? {
                      amount: str(m.amount) ?? undefined,
                      currency: str(m.currency) ?? undefined,
                  }
                : {}),
        });
    }
    // An email with its event is told by the event; one from before the
    // history began is told from its Message, by who queued it.
    const told = new Set(events.map((e) => e.messageId).filter(Boolean));
    for (const m of emails) {
        if (told.has(m.id)) continue;
        out.push({
            source: "EMAIL",
            id: m.id,
            kind: m.template === "INVOICE_REMINDER" ? "REMINDED" : "SENT",
            at: m.createdAt.toISOString(),
            actor: person(m.createdByUserId),
            to: m.toAddress,
            status: m.status,
        });
    }
    const has = (kind: InvoiceEventKind) => events.some((e) => e.kind === kind);
    const dated = (
        kind: "ISSUED" | "PAID" | "VOIDED",
        at: Date | null,
    ): void => {
        if (at) {
            out.push({
                source: "DATE",
                id: `date:${kind}`,
                kind,
                at: at.toISOString(),
                actor: NO_ONE,
            });
        }
    };
    if (!has("ISSUED")) dated("ISSUED", invoice.issuedAt);
    if (!has("VOIDED")) dated("VOIDED", invoice.voidedAt);
    if (audits.length === 0) dated("PAID", invoice.paidAt);

    return out
        .map((e, n) => ({ e, n }))
        .sort((a, b) => Date.parse(b.e.at) - Date.parse(a.e.at) || a.n - b.n)
        .map(({ e }) => e);
}
