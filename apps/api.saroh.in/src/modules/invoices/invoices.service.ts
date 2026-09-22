import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type {
    InvoiceInputDto,
    ListInvoicesQueryDto,
    OwedQueryDto,
    RecordPaymentDto,
    VoidInvoiceDto,
} from "./dto";
import type { InvoiceSource } from "./invoice-state";
import {
    CAPTURED_NEEDS_REFUND,
    DEFAULT_DUE_DAYS,
    isPastDue,
    viewWhere,
} from "./invoice-state";
import { nextInvoiceNumber } from "./numbering";
import { mintPayToken } from "./pay-token";
import type {
    InvoiceOnlineView,
    InvoiceRow,
    InvoiceViewModel,
} from "./serialize";
import {
    contactName,
    INVOICE_DETAIL_SELECT,
    INVOICE_LIST_SELECT,
    serializeInvoice,
} from "./serialize";
import type { LineInput } from "./totals";
import { fromCents, priceInvoice, toCents } from "./totals";

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 500;

/** A refusal the form can put on the field it is about. */
function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function notFound(): never {
    throw new NotFoundException("Invoice not found");
}

/** What another module asks to be invoiced, inside its own transaction. */
export interface IssueInvoiceInput {
    contactId: string;
    currency: string;
    lines: LineInput[];
    tax?: string;
    source: Exclude<InvoiceSource, "MANUAL">;
    subscriptionId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    courseEnrollmentId?: string;
    packPurchaseId?: string;
    createdByUserId?: string | null;
    issuedAt?: Date;
    dueAt?: Date;
}

/** Unpaid invoices for a person or a subscription, per currency. */
export interface OwedSummary {
    unpaidCount: number;
    overdueCount: number;
    totals: { currency: string; amount: string }[];
}

/**
 * Invoices a business issues (ADR-007): simple, numbered per business, and
 * never changed once issued.
 *
 * Every read and write is scoped to the organization from the request
 * context; an invoice or contact from another business is a 404. Lines are
 * priced here, in minor units, never by the client.
 *
 * The lifecycle is DRAFT → ISSUED → PAID, or → VOID. A draft is edited or
 * deleted freely; an issued invoice is only paid or voided, and a mistake is
 * voided and reissued as a new draft, so a number once given out always
 * means the same thing. Nothing here sends anything to the customer.
 */
@Injectable()
export class InvoicesService {
    async list(
        ctx: OrganizationContext,
        query: ListInvoicesQueryDto,
    ): Promise<InvoiceViewModel[]> {
        authorize(ctx, "invoice:read");
        const now = new Date();
        const rows = await prisma.invoice.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.view ? viewWhere(query.view, now) : {}),
                ...(query.contactId ? { contactId: query.contactId } : {}),
                ...(query.subscriptionId
                    ? { subscriptionId: query.subscriptionId }
                    : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: INVOICE_LIST_SELECT,
        });
        return rows.map((r) => serializeInvoice(r as InvoiceRow, now));
    }

    /**
     * One invoice, with what the workspace needs to offer its pay link: is a
     * provider connected, is a link out, and what came in online.
     */
    async get(ctx: OrganizationContext, id: string): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:read");
        const invoice = await this.read(ctx.organizationId, id);
        return {
            ...invoice,
            online: await this.online(ctx.organizationId, id),
        };
    }

    /**
     * Make the invoice's pay link (U13) and hand it over — the only time the
     * token is ever seen, since only its hash is kept. Asking again makes a
     * new link, and the one before stops working: that is both "copy the
     * link" the first time and "new link" after it.
     *
     * Only an issued invoice has a link, and only a business with a
     * connected provider can take the payment behind it.
     */
    async createPayLink(
        ctx: OrganizationContext,
        id: string,
    ): Promise<{ token: string }> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        if (current.status !== "ISSUED") {
            throw new ConflictException(
                current.status === "DRAFT"
                    ? "Issue the invoice before sharing a pay link."
                    : this.notIssued(current.status, "paid"),
            );
        }
        const connected = await prisma.merchantPaymentProvider.count({
            where: { organizationId: ctx.organizationId, status: "CONNECTED" },
        });
        if (connected === 0) {
            throw new ConflictException(
                "Connect a payment provider to take payment online.",
            );
        }
        const { token, tokenHash } = mintPayToken();
        const { count } = await prisma.invoice.updateMany({
            where: { id, organizationId: ctx.organizationId, status: "ISSUED" },
            data: { payTokenHash: tokenHash },
        });
        if (count === 0) {
            throw new ConflictException("This invoice changed. Reload it.");
        }
        return { token };
    }

    /**
     * What a person, or one subscription, still owes: issued and unpaid.
     * Totals are kept per currency rather than added across them.
     */
    async owed(
        ctx: OrganizationContext,
        query: OwedQueryDto,
    ): Promise<OwedSummary> {
        authorize(ctx, "invoice:read");
        if (!query.contactId && !query.subscriptionId) {
            fieldError("Ask about a contact or a subscription", "contactId");
        }
        return this.owedFor(ctx.organizationId, query);
    }

    /** The same sum, for modules that already authorized their own read. */
    async owedFor(
        organizationId: string,
        who: { contactId?: string; subscriptionId?: string },
    ): Promise<OwedSummary> {
        const now = new Date();
        const rows = await prisma.invoice.findMany({
            where: {
                organizationId,
                status: "ISSUED",
                ...(who.contactId ? { contactId: who.contactId } : {}),
                ...(who.subscriptionId
                    ? { subscriptionId: who.subscriptionId }
                    : {}),
            },
            select: { status: true, currency: true, total: true, dueAt: true },
        });
        const byCurrency = new Map<string, number>();
        let overdueCount = 0;
        for (const r of rows) {
            byCurrency.set(
                r.currency,
                (byCurrency.get(r.currency) ?? 0) + toCents(r.total.toString()),
            );
            if (isPastDue(r, now)) overdueCount += 1;
        }
        return {
            unpaidCount: rows.length,
            overdueCount,
            totals: [...byCurrency.entries()].map(([currency, cents]) => ({
                currency,
                amount: fromCents(cents),
            })),
        };
    }

    async createDraft(
        ctx: OrganizationContext,
        dto: InvoiceInputDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        if (!dto.contactId) fieldError("Choose who to bill", "contactId");
        if (!dto.currency) fieldError("Choose a currency", "currency");
        if (!dto.lines) {
            fieldError("An invoice needs at least one line", "lines");
        }
        const { contactId, currency } = dto;
        await this.assertContact(prisma, ctx.organizationId, contactId);
        const totals = priceInvoice(dto.lines, dto.tax ?? "0");

        const id = await prisma.$transaction(async (tx) => {
            const created = await tx.invoice.create({
                data: {
                    organizationId: ctx.organizationId,
                    status: "DRAFT",
                    source: "MANUAL",
                    contactId,
                    currency,
                    subtotal: totals.subtotal,
                    tax: totals.tax,
                    total: totals.total,
                    dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            await this.writeLines(tx, ctx.organizationId, created.id, totals);
            return created.id;
        });
        return this.read(ctx.organizationId, id);
    }

    async updateDraft(
        ctx: OrganizationContext,
        id: string,
        dto: InvoiceInputDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        this.assertDraft(current.status, "changed");
        if (dto.contactId) {
            await this.assertContact(prisma, ctx.organizationId, dto.contactId);
        }

        const lines: LineInput[] =
            dto.lines ??
            (current.lines ?? []).map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
            }));
        const totals = priceInvoice(lines, dto.tax ?? current.tax);

        await prisma.$transaction(async (tx) => {
            // Guarded on DRAFT so an issue that lands between the read and
            // this write is not silently overwritten.
            const { count } = await tx.invoice.updateMany({
                where: {
                    id,
                    organizationId: ctx.organizationId,
                    status: "DRAFT",
                },
                data: {
                    ...(dto.contactId ? { contactId: dto.contactId } : {}),
                    ...(dto.currency ? { currency: dto.currency } : {}),
                    ...(dto.dueAt !== undefined
                        ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }
                        : {}),
                    subtotal: totals.subtotal,
                    tax: totals.tax,
                    total: totals.total,
                },
            });
            if (count === 0) this.assertDraft("ISSUED", "changed");
            if (dto.lines) {
                await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
                await this.writeLines(tx, ctx.organizationId, id, totals);
            }
        });
        return this.read(ctx.organizationId, id);
    }

    async deleteDraft(ctx: OrganizationContext, id: string): Promise<void> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        this.assertDraft(current.status, "deleted");
        const { count } = await prisma.invoice.deleteMany({
            where: { id, organizationId: ctx.organizationId, status: "DRAFT" },
        });
        if (count === 0) this.assertDraft("ISSUED", "deleted");
    }

    /**
     * Give a draft its number and fix it. The number is taken and the invoice
     * written in one transaction, guarded on DRAFT, so two clicks on Issue
     * give out one number and the second is refused.
     */
    async issue(
        ctx: OrganizationContext,
        id: string,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        this.assertDraft(current.status, "issued again");

        await prisma.$transaction(async (tx) => {
            // Read the draft again under its lock: an edit that landed since
            // the read above (a new contact, a new due date) is what goes out,
            // not a mix of the old bill-to and the new contact.
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
            const draft = await tx.invoice.findFirst({
                where: { id, organizationId: ctx.organizationId },
                select: { status: true, contactId: true, dueAt: true },
            });
            if (!draft) notFound();
            this.assertDraft(draft.status, "issued again");
            if (!draft.contactId) {
                fieldError("Choose who to bill before issuing", "contactId");
            }
            const issuedAt = new Date();
            // An invoice is never born overdue.
            if (draft.dueAt && draft.dueAt <= issuedAt) {
                fieldError(
                    "The due date has passed. Pick a later one, or clear it to give them the usual time.",
                    "dueAt",
                );
            }
            const billTo = await this.billTo(
                tx,
                ctx.organizationId,
                draft.contactId,
            );
            const number = await nextInvoiceNumber(tx, ctx.organizationId);
            const { count } = await tx.invoice.updateMany({
                where: {
                    id,
                    organizationId: ctx.organizationId,
                    status: "DRAFT",
                },
                data: {
                    status: "ISSUED",
                    number,
                    issuedAt,
                    dueAt:
                        draft.dueAt ??
                        new Date(
                            issuedAt.getTime() + DEFAULT_DUE_DAYS * DAY_MS,
                        ),
                    ...billTo,
                },
            });
            // Throwing rolls the number back with everything else.
            if (count === 0) this.assertDraft("ISSUED", "issued again");
        });
        return this.read(ctx.organizationId, id);
    }

    async voidInvoice(
        ctx: OrganizationContext,
        id: string,
        dto: VoidInvoiceDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        await prisma.$transaction((tx) =>
            this.voidInTx(tx, ctx.organizationId, id, dto.reason),
        );
        return this.read(ctx.organizationId, id);
    }

    /**
     * Void an issued invoice and open a draft in its place, carrying the same
     * person, the same reason for being (subscription period, course, pack)
     * and the same lines. The draft is what the merchant corrects and issues.
     *
     * The void comes first: a subscription period may have only one invoice
     * that is not void, and the draft is one.
     */
    async reissue(
        ctx: OrganizationContext,
        id: string,
        dto: VoidInvoiceDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const draftId = await prisma.$transaction(async (tx) => {
            await this.voidInTx(tx, ctx.organizationId, id, dto.reason);
            const old = await tx.invoice.findFirst({
                where: { id, organizationId: ctx.organizationId },
                select: {
                    contactId: true,
                    currency: true,
                    subtotal: true,
                    tax: true,
                    total: true,
                    source: true,
                    subscriptionId: true,
                    periodStart: true,
                    periodEnd: true,
                    courseEnrollmentId: true,
                    packPurchaseId: true,
                    lines: {
                        orderBy: { position: "asc" },
                        select: {
                            position: true,
                            description: true,
                            quantity: true,
                            unitPrice: true,
                            amount: true,
                        },
                    },
                },
            });
            if (!old) notFound();
            const draft = await tx.invoice.create({
                data: {
                    organizationId: ctx.organizationId,
                    status: "DRAFT",
                    contactId: old.contactId,
                    currency: old.currency,
                    subtotal: old.subtotal,
                    tax: old.tax,
                    total: old.total,
                    source: old.source,
                    subscriptionId: old.subscriptionId,
                    periodStart: old.periodStart,
                    periodEnd: old.periodEnd,
                    courseEnrollmentId: old.courseEnrollmentId,
                    packPurchaseId: old.packPurchaseId,
                    reissuedFromId: id,
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            await tx.invoiceLine.createMany({
                data: old.lines.map((l) => ({
                    organizationId: ctx.organizationId,
                    invoiceId: draft.id,
                    ...l,
                })),
            });
            return draft.id;
        });
        return this.read(ctx.organizationId, draftId);
    }

    /**
     * Money taken outside Saroh — cash, UPI, a bank transfer, a card at the
     * counter — written down. Nothing is charged.
     */
    async recordPayment(
        ctx: OrganizationContext,
        id: string,
        dto: RecordPaymentDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        if (current.status !== "ISSUED") {
            throw new ConflictException(this.notIssued(current.status, "paid"));
        }
        const { count } = await prisma.invoice.updateMany({
            where: { id, organizationId: ctx.organizationId, status: "ISSUED" },
            data: {
                status: "PAID",
                paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
                paymentMethod: dto.method,
                paymentReference: dto.reference ?? null,
                paymentNote: dto.note ?? null,
            },
        });
        if (count === 0) {
            throw new ConflictException("This invoice changed. Reload it.");
        }
        return this.read(ctx.organizationId, id);
    }

    /**
     * Issue an invoice on another module's transaction — a subscription
     * period, a course enrolment, a pack sale. It is written straight to
     * ISSUED with its number and bill-to; if the caller's transaction rolls
     * back, so does the invoice and the number it took.
     *
     * Authorization is the caller's: selling a pack under `pack:write` issues
     * its invoice without also needing `invoice:write`.
     */
    async issueInTx(
        tx: Tx,
        organizationId: string,
        input: IssueInvoiceInput,
    ): Promise<{ id: string; number: string }> {
        const totals = priceInvoice(input.lines, input.tax ?? "0");
        const billTo = await this.billTo(tx, organizationId, input.contactId);
        const number = await nextInvoiceNumber(tx, organizationId);
        const issuedAt = input.issuedAt ?? new Date();
        const created = await tx.invoice.create({
            data: {
                organizationId,
                status: "ISSUED",
                number,
                contactId: input.contactId,
                ...billTo,
                currency: input.currency,
                subtotal: totals.subtotal,
                tax: totals.tax,
                total: totals.total,
                issuedAt,
                dueAt:
                    input.dueAt ??
                    new Date(issuedAt.getTime() + DEFAULT_DUE_DAYS * DAY_MS),
                source: input.source,
                subscriptionId: input.subscriptionId ?? null,
                periodStart: input.periodStart ?? null,
                periodEnd: input.periodEnd ?? null,
                courseEnrollmentId: input.courseEnrollmentId ?? null,
                packPurchaseId: input.packPurchaseId ?? null,
                createdByUserId: input.createdByUserId ?? null,
            },
            select: { id: true },
        });
        await this.writeLines(tx, organizationId, created.id, totals);
        return { id: created.id, number };
    }

    // — internals —————————————————————————————————————————————————

    private async read(
        organizationId: string,
        id: string,
    ): Promise<InvoiceViewModel> {
        const row = await prisma.invoice.findFirst({
            where: { id, organizationId },
            select: INVOICE_DETAIL_SELECT,
        });
        if (!row) notFound();
        return serializeInvoice(row, new Date(), { detail: true });
    }

    private async voidInTx(
        tx: Tx,
        organizationId: string,
        id: string,
        reason: string,
    ): Promise<void> {
        const row = await tx.invoice.findFirst({
            where: { id, organizationId },
            select: { status: true },
        });
        if (!row) notFound();
        if (row.status !== "ISSUED") {
            throw new ConflictException(this.notIssued(row.status, "voided"));
        }
        // A void invoice is not to be paid, so its pay link stops working.
        const { count } = await tx.invoice.updateMany({
            where: { id, organizationId, status: "ISSUED" },
            data: {
                status: "VOID",
                voidedAt: new Date(),
                voidReason: reason,
                payTokenHash: null,
            },
        });
        if (count === 0) {
            throw new ConflictException("This invoice changed. Reload it.");
        }
    }

    /**
     * Money taken online for this invoice. A payment that arrived after the
     * invoice was already paid or void is not applied to it and is shown as
     * needing a refund until the provider reports one.
     */
    private async online(
        organizationId: string,
        invoiceId: string,
    ): Promise<InvoiceOnlineView> {
        const [connected, link, intents] = await Promise.all([
            prisma.merchantPaymentProvider.count({
                where: { organizationId, status: "CONNECTED" },
            }),
            prisma.invoice.findFirst({
                where: { id: invoiceId, organizationId },
                select: { payTokenHash: true },
            }),
            prisma.paymentIntent.findMany({
                where: { organizationId, invoiceId, status: "SUCCEEDED" },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    provider: true,
                    amountCents: true,
                    currency: true,
                    updatedAt: true,
                    attempts: {
                        where: { status: CAPTURED_NEEDS_REFUND },
                        select: { id: true },
                        take: 1,
                    },
                    refunds: { select: { status: true } },
                },
            }),
        ]);
        return {
            providerConnected: connected > 0,
            payLinkActive: Boolean(link?.payTokenHash),
            payments: intents.map((i) => ({
                id: i.id,
                provider: i.provider,
                amount: fromCents(i.amountCents),
                currency: i.currency,
                at: i.updatedAt.toISOString(),
                applied: i.attempts.length === 0,
                refund: i.refunds.some((r) => r.status === "SUCCEEDED")
                    ? "REFUNDED"
                    : i.refunds.some((r) => r.status === "PENDING")
                      ? "PENDING"
                      : "NONE",
            })),
        };
    }

    /** The name and email the invoice keeps, whatever happens to the contact. */
    private async billTo(
        tx: Pick<Tx, "contact">,
        organizationId: string,
        contactId: string,
    ): Promise<{ billToName: string; billToEmail: string }> {
        const contact = await tx.contact.findFirst({
            where: { id: contactId, organizationId },
            select: { firstName: true, lastName: true, email: true },
        });
        if (!contact) fieldError("That contact was not found", "contactId");
        return { billToName: contactName(contact), billToEmail: contact.email };
    }

    /** A contact id from the client is checked against the business: a miss is a 404. */
    private async assertContact(
        db: Pick<Tx, "contact">,
        organizationId: string,
        contactId: string,
    ): Promise<void> {
        const found = await db.contact.findFirst({
            where: { id: contactId, organizationId },
            select: { id: true },
        });
        if (!found) {
            throw new NotFoundException({
                message: "That contact was not found",
                details: { field: "contactId" },
            });
        }
    }

    private async writeLines(
        tx: Pick<Tx, "invoiceLine">,
        organizationId: string,
        invoiceId: string,
        totals: ReturnType<typeof priceInvoice>,
    ): Promise<void> {
        await tx.invoiceLine.createMany({
            data: totals.lines.map((l) => ({
                organizationId,
                invoiceId,
                position: l.position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                amount: l.amount,
            })),
        });
    }

    private assertDraft(status: string, verb: string): void {
        if (status === "DRAFT") return;
        throw new ConflictException(
            status === "VOID"
                ? `A void invoice cannot be ${verb}.`
                : `An issued invoice cannot be ${verb}. Void it and reissue it instead.`,
        );
    }

    private notIssued(status: string, verb: string): string {
        if (status === "DRAFT")
            return `Issue the invoice before it is ${verb}.`;
        if (status === "PAID") return `This invoice is already paid.`;
        return `A void invoice cannot be ${verb}.`;
    }
}
