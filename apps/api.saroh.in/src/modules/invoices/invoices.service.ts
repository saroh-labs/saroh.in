import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    assertPlanTakesOnlinePayment,
    isRenewalInvoice,
    planTakesOnlinePayment,
} from "../billing/online-payments-plan";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { businessPayInstructionsOf } from "../organizations/business-pay-instructions";
import { authorize } from "../organizations/organization-policy";
import {
    autopayChargeInProgress,
    chargeUnderWayOn,
} from "../payments/charge-under-way";
import { businessPayLinkProvider } from "../payments/pay-link-provider";
import { assertBusinessDetails } from "./business-details";
import type {
    CreditInvoiceDto,
    InvoiceInputDto,
    ListInvoicesQueryDto,
    OwedQueryDto,
    RecordPaymentDto,
    VoidInvoiceDto,
} from "./dto";
import { exemptInvoiceIds } from "./exempt-invoices";
import { isGstRate, rateToBps } from "./gst";
import { gstinProblem, stateCode } from "./gst-states";
import type { InvoiceSource } from "./invoice-state";
import {
    CAPTURED_NEEDS_REFUND,
    DEFAULT_DUE_DAYS,
    isPastDue,
    NOT_A_BOOKING_HOLD,
    OWED_WHERE,
    paidSinceFilter,
    viewWhere,
} from "./invoice-state";
import { listFilterWhere } from "./list-filter";
import type { BuiltDocument, TaxProfile } from "./order-invoice";
import { buildManualInvoice } from "./order-invoice";
import {
    documentColumns,
    issueCreditNote,
    loadTaxProfile,
    numberFor,
    writeDocumentLines,
} from "./order-invoicing";
import { invoiceOnlineBlocker } from "./pay-online";
import { mintPayToken } from "./pay-token";
import { assertPaymentsOn } from "./payments-on";
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
import { fromCents, MAX_CENTS, toCents } from "./totals";

type Tx = Prisma.TransactionClient;

/**
 * What an invoice's link is for: a pay link needs Payments and a provider
 * that can take the money; a view link (Send, with neither) doesn't.
 */
export interface LinkOptions {
    requireProvider: boolean;
}
const PAY_LINK: LinkOptions = { requireProvider: true };

/**
 * A link just made: its token, seen this once, and when it was made, which
 * the invoice keeps beside the token's hash (#870).
 */
export interface MadeLink {
    token: string;
    payLinkCreatedAt: Date;
}
const VIEW_LINK: LinkOptions = { requireProvider: false };

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
    source: Exclude<InvoiceSource, "MANUAL" | "ORDER">;
    subscriptionId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    courseEnrollmentId?: string;
    packPurchaseId?: string;
    bookingId?: string;
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

/** The bill-to GST details a draft carries, as the DTO sends them. */
interface BillToGst {
    billToGstin: string | null;
    billToState: string | null;
    billToAddress: string | null;
}

/**
 * Invoices a business issues (ADR-007, amended by ADR-008): numbered per
 * business and series, and never changed once issued.
 *
 * Every read and write is scoped to the organization from the request
 * context; an invoice or contact from another business is a 404. Lines are
 * priced here, in minor units, never by the client — and on a GST-registered
 * business's invoice, taxed here too (`gst.ts`): prices include GST, the
 * place of supply is the bill-to state, else the business's.
 *
 * The lifecycle is DRAFT → ISSUED → PAID. A draft is edited or deleted
 * freely; an issued invoice is never edited or deleted. A mistake on a
 * registered business's invoice is corrected by a credit note (`credit`),
 * which leaves it CREDITED; an unregistered business's receipt may still be
 * voided and reissued. An order's own invoice is the order's paper: paid,
 * credited and refunded through the order, never here. Nothing here sends
 * anything to the customer.
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
                ...NOT_A_BOOKING_HOLD,
                ...(query.view ? viewWhere(query.view, now) : {}),
                ...(query.contactId ? { contactId: query.contactId } : {}),
                ...(query.subscriptionId
                    ? { subscriptionId: query.subscriptionId }
                    : {}),
                ...(query.paidSince
                    ? paidSinceFilter(new Date(query.paidSince))
                    : {}),
                // What it was for (D18); ANDed on, so hidden drafts stay hidden.
                ...listFilterWhere(query),
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: INVOICE_LIST_SELECT,
        });
        const exempt = await exemptInvoiceIds(prisma, ctx.organizationId, rows);
        return rows.map((r) =>
            serializeInvoice(r as InvoiceRow, now, {
                exempt: exempt.has(r.id),
            }),
        );
    }

    /**
     * One invoice, with what the workspace needs to offer its pay link: is a
     * provider connected, is a link out, and what came in online.
     */
    async get(ctx: OrganizationContext, id: string): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:read");
        const invoice = await this.read(ctx.organizationId, id);
        const owed =
            invoice.standing === "ISSUED" || invoice.standing === "OVERDUE";
        const [online, payInstructions] = await Promise.all([
            this.online(ctx.organizationId, id),
            // "How to pay us" on the printed paper (#833), as on the PDF:
            // only while something is owed on it.
            owed && invoice.kind !== "CREDIT_NOTE"
                ? businessPayInstructionsOf(ctx.organizationId)
                : undefined,
        ]);
        return {
            ...invoice,
            online,
            ...(payInstructions !== undefined ? { payInstructions } : {}),
        };
    }

    /**
     * Make the invoice's pay link (U13) and hand it over — the only time the
     * token is ever seen, since only its hash is kept. Asking again makes a
     * new link, and the one before stops working: that is both "copy the
     * link" the first time and "new link" after it.
     *
     * Only an issued invoice has a link, and only a business with Payments
     * on and a connected provider can take the payment behind it (DEC-070:
     * invoicing doesn't need Payments, taking money online does). An
     * order's invoice never has one: paying it pays the order (ADR-008).
     */
    async createPayLink(
        ctx: OrganizationContext,
        id: string,
    ): Promise<MadeLink> {
        return this.payLink(prisma, ctx, id, PAY_LINK);
    }

    /**
     * A view link (#833, DEC-070): the same kind of token, for a business
     * whose invoices can't be paid online — on a plan without online
     * payments, with Payments off or no provider. It opens the invoice on
     * the business's site with no Pay button and with "How to pay us", so
     * a business without an email provider can still hand its customer
     * the invoice and how to pay. Like a pay link, it replaces the one
     * before. Asks nothing of Payments, the provider or the plan.
     */
    async createViewLink(
        ctx: OrganizationContext,
        id: string,
    ): Promise<MadeLink> {
        return this.payLink(prisma, ctx, id, VIEW_LINK);
    }

    /**
     * {@link createPayLink} on the caller's transaction, so what the caller
     * records about the new link commits or rolls back with it, under the
     * caller's lock — a subscription's RETRIED, say.
     *
     * Send passes `requireProvider: false` when the business doesn't take
     * payment online (DEC-070): the same kind of token then opens the
     * invoice without a Pay button, a view link.
     */
    async createPayLinkInTx(
        tx: Tx,
        ctx: OrganizationContext,
        id: string,
        options: LinkOptions = PAY_LINK,
    ): Promise<MadeLink> {
        return this.payLink(tx, ctx, id, options);
    }

    private async payLink(
        db: Tx,
        ctx: OrganizationContext,
        id: string,
        options: LinkOptions,
    ): Promise<MadeLink> {
        authorize(ctx, "invoice:write");
        // A link asks to be paid: the business details first (DEC-068). A
        // member's own "Pay now" is never refused for it.
        await assertBusinessDetails(db, ctx.organizationId);
        // Taking money online is Payments' (DEC-070); a view link isn't.
        if (options.requireProvider) {
            await assertPaymentsOn(db, ctx.organizationId, "make a pay link");
            // And the plan's (403 MODULE_LOCKED), except for a renewal of a
            // subscription the business already has: that stays payable.
            if (!(await planTakesOnlinePayment(ctx.organizationId))) {
                const paper = await db.invoice.findFirst({
                    where: { id, organizationId: ctx.organizationId },
                    select: { subscriptionId: true },
                });
                if (!isRenewalInvoice(paper)) {
                    await assertPlanTakesOnlinePayment(ctx.organizationId);
                }
            }
        }
        return this.mintInvoiceLink(db, ctx.organizationId, id, options);
    }

    /**
     * A fresh pay link for a member's own overdue invoice, from their
     * account on the business's site (round-2 A8): the same link a team
     * member makes, replacing the old one, so the customer never meets a
     * stale link. There is no team member to authorize: the caller has
     * already found the invoice by the member's own contact.
     */
    async payLinkForCustomer(
        db: Tx,
        organizationId: string,
        id: string,
    ): Promise<MadeLink> {
        return this.mintInvoiceLink(db, organizationId, id, PAY_LINK);
    }

    /**
     * Mint the invoice's link token. A pay link (`requireProvider`) needs a
     * provider that can open the checkout window. A view link doesn't: its
     * token is the same kind, and the pay page offers "Pay online" only
     * when the business takes payment online (DEC-070).
     */
    private async mintInvoiceLink(
        db: Tx,
        organizationId: string,
        id: string,
        options: LinkOptions,
    ): Promise<MadeLink> {
        const ctx = { organizationId };
        const current = await this.read(ctx.organizationId, id, db);
        this.assertOwnPaper(current, "given a pay link");
        if (current.status !== "ISSUED") {
            throw new ConflictException(
                current.status === "DRAFT"
                    ? "Issue the invoice before sharing a pay link."
                    : this.notIssued(current.status, "paid"),
            );
        }
        // A provider that can open the checkout window, by the rule the pay
        // page starts its payment with (B11, D22): a Razorpay connection
        // missing its public key id counts as none, and the 409 says what
        // it needs.
        if (options.requireProvider) {
            await businessPayLinkProvider(db, ctx.organizationId);
        }
        // One charge at a time (D13): no link while autopay is charging it.
        if (await chargeUnderWayOn(db, ctx.organizationId, id)) {
            throw autopayChargeInProgress();
        }
        const { token, tokenHash } = mintPayToken();
        const payLinkCreatedAt = new Date();
        const { count } = await db.invoice.updateMany({
            where: {
                id,
                organizationId: ctx.organizationId,
                status: "ISSUED",
                orderId: null,
                kind: { not: "CREDIT_NOTE" },
            },
            data: { payTokenHash: tokenHash, payLinkCreatedAt },
        });
        if (count === 0) {
            throw new ConflictException("This invoice changed. Reload it.");
        }
        return { token, payLinkCreatedAt };
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

    /**
     * The same sum, for modules that already authorized their own read.
     * An order's invoice and credit notes are never owed (ADR-008): what an
     * order still needs is owed on the order.
     */
    async owedFor(
        organizationId: string,
        who: { contactId?: string; subscriptionId?: string },
    ): Promise<OwedSummary> {
        const now = new Date();
        const rows = await prisma.invoice.findMany({
            where: {
                organizationId,
                status: "ISSUED",
                ...OWED_WHERE,
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
        const gst = this.billToGst(dto, {
            billToGstin: null,
            billToState: null,
            billToAddress: null,
        });
        const profile = await loadTaxProfile(prisma, ctx.organizationId);
        const doc = this.price(dto.lines, profile, gst, dto.tax ?? "0");

        const id = await prisma.$transaction(async (tx) => {
            const created = await tx.invoice.create({
                data: {
                    organizationId: ctx.organizationId,
                    status: "DRAFT",
                    source: "MANUAL",
                    contactId,
                    currency,
                    ...gst,
                    ...documentColumns(doc),
                    dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            await writeDocumentLines(tx, ctx.organizationId, created.id, doc);
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
                gstRate: l.gst?.rate ?? null,
                hsnSac: l.gst?.hsnSac ?? null,
            }));
        const gst = this.billToGst(dto, {
            billToGstin: current.billToGst.gstin,
            billToState: current.billToGst.state,
            billToAddress: current.billToGst.address,
        });
        const profile = await loadTaxProfile(prisma, ctx.organizationId);
        // A receipt keeps the tax typed on it; a tax invoice derives its own.
        const typedTax = dto.tax ?? (current.gst ? "0" : current.tax);
        const doc = this.price(lines, profile, gst, typedTax);

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
                    ...gst,
                    ...documentColumns(doc),
                },
            });
            if (count === 0) this.assertDraft("ISSUED", "changed");
            // Always rewritten: the tax on each line follows the bill-to.
            await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
            await writeDocumentLines(tx, ctx.organizationId, id, doc);
        });
        return this.read(ctx.organizationId, id);
    }

    /** A draft is discarded; an issued invoice is never deleted (ADR-008). */
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
     *
     * The tax is worked out again here, with the business's GST standing as
     * it is at issue, and frozen with the seller's GSTIN and the place of
     * supply: the paper says what was true when it went out.
     */
    async issue(
        ctx: OrganizationContext,
        id: string,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        this.assertDraft(current.status, "issued again");
        // Before its number: the paper prints the business's address, and
        // a registered business's GSTIN (DEC-068).
        await assertBusinessDetails(prisma, ctx.organizationId);

        await prisma.$transaction(async (tx) => {
            // Read the draft again under its lock: an edit that landed since
            // the read above (a new contact, a new due date) is what goes out,
            // not a mix of the old bill-to and the new contact.
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
            const draft = await tx.invoice.findFirst({
                where: { id, organizationId: ctx.organizationId },
                select: {
                    status: true,
                    contactId: true,
                    dueAt: true,
                    tax: true,
                    billToGstin: true,
                    billToState: true,
                    billToAddress: true,
                    lines: {
                        orderBy: { position: "asc" },
                        select: {
                            description: true,
                            quantity: true,
                            unitPrice: true,
                            gstRate: true,
                            hsnSac: true,
                        },
                    },
                },
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
            const profile = await loadTaxProfile(tx, ctx.organizationId);
            const doc = this.price(
                draft.lines.map((l) => ({
                    description: l.description,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice.toString(),
                    gstRate: l.gstRate?.toString() ?? null,
                    hsnSac: l.hsnSac,
                })),
                profile,
                {
                    billToGstin: draft.billToGstin,
                    billToState: draft.billToState,
                    billToAddress: draft.billToAddress,
                },
                draft.tax.toString(),
                // A draft written before the business registered carried a
                // typed tax; a tax invoice derives its own.
            );
            const number = await numberFor(
                tx,
                ctx.organizationId,
                profile,
                "INVOICE",
                issuedAt,
            );
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
                    ...documentColumns(doc),
                },
            });
            // Throwing rolls the number back with everything else.
            if (count === 0) this.assertDraft("ISSUED", "issued again");
            await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
            await writeDocumentLines(tx, ctx.organizationId, id, doc);
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
     * Cancel an issued invoice with a credit note for all that is left of it
     * (ADR-008): the invoice keeps its number and lines and reads CREDITED,
     * its pay link stops working, and the credit note is numbered in its
     * own series. How a GST-registered business undoes an invoice — it never
     * voids one. An order's invoice is credited by refunding the order.
     * Answers with the credit note.
     */
    async credit(
        ctx: OrganizationContext,
        id: string,
        dto: CreditInvoiceDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        this.assertOwnPaper(current, "cancelled here");
        if (current.status !== "ISSUED" && current.status !== "PAID") {
            throw new ConflictException(
                current.status === "DRAFT"
                    ? "A draft has nothing to credit. Delete it instead."
                    : current.status === "CREDITED"
                      ? "This invoice is already credited."
                      : "A void invoice cannot be credited.",
            );
        }
        const noteId = await prisma.$transaction(async (tx) => {
            const note = await issueCreditNote(tx, {
                invoiceId: id,
                amountCents: MAX_CENTS,
                note: dto.reason,
                createdByUserId: ctx.userId,
            });
            if (!note) {
                throw new ConflictException(
                    "Nothing is left on this invoice to credit.",
                );
            }
            return note.id;
        });
        return this.read(ctx.organizationId, noteId);
    }

    /**
     * Void an issued invoice and open a draft in its place, carrying the same
     * person, the same reason for being (subscription period, course, pack)
     * and the same lines. The draft is what the merchant corrects and issues.
     * Only an unregistered business's receipt: a tax invoice is credited.
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
                    billToGstin: true,
                    billToState: true,
                    billToAddress: true,
                    lines: {
                        orderBy: { position: "asc" },
                        select: {
                            position: true,
                            description: true,
                            quantity: true,
                            unitPrice: true,
                            amount: true,
                            discount: true,
                            hsnSac: true,
                            gstRate: true,
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
                    billToGstin: old.billToGstin,
                    billToState: old.billToState,
                    billToAddress: old.billToAddress,
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
     * counter — written down. Nothing is charged. An order's invoice is paid
     * on the order.
     */
    async recordPayment(
        ctx: OrganizationContext,
        id: string,
        dto: RecordPaymentDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const current = await this.read(ctx.organizationId, id);
        this.assertOwnPaper(current, "paid here");
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
     * back, so does the invoice and the number it took. A registered
     * business's is a tax invoice, its lines taxed at the rates they carry.
     *
     * Authorization is the caller's: selling a pack under `pack:sell` issues
     * its invoice without also needing `invoice:write`.
     */
    async issueInTx(
        tx: Tx,
        organizationId: string,
        input: IssueInvoiceInput,
    ): Promise<{ id: string; number: string }> {
        const profile = await loadTaxProfile(tx, organizationId);
        const doc = this.price(
            input.lines,
            profile,
            { billToGstin: null, billToState: null, billToAddress: null },
            input.tax ?? "0",
        );
        // The renewal job and a sale name a contact read before this
        // transaction: a merge since then points it at the survivor (C9).
        const resolved = await resolveContact(
            tx,
            input.contactId,
            organizationId,
        );
        if (!resolved || resolved.removed) {
            fieldError("That contact was not found", "contactId");
        }
        const contactId = resolved.id;
        const billTo = await this.billTo(tx, organizationId, contactId);
        const issuedAt = input.issuedAt ?? new Date();
        const number = await numberFor(
            tx,
            organizationId,
            profile,
            "INVOICE",
            issuedAt,
        );
        const created = await tx.invoice.create({
            data: {
                organizationId,
                status: "ISSUED",
                number,
                contactId,
                ...billTo,
                currency: input.currency,
                ...documentColumns(doc),
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
                bookingId: input.bookingId ?? null,
                createdByUserId: input.createdByUserId ?? null,
            },
            select: { id: true },
        });
        await writeDocumentLines(tx, organizationId, created.id, doc);
        return { id: created.id, number };
    }

    // — internals —————————————————————————————————————————————————

    private async read(
        organizationId: string,
        id: string,
        db: Tx = prisma,
    ): Promise<InvoiceViewModel> {
        const row = await db.invoice.findFirst({
            where: { id, organizationId },
            select: INVOICE_DETAIL_SELECT,
        });
        if (!row) notFound();
        return serializeInvoice(row, new Date(), { detail: true });
    }

    /**
     * Price and tax lines (ADR-008). A registered business's lines are taxed
     * at their rates from the inclusive price, the place of supply read from
     * the bill-to state; an unregistered one's receipt keeps the tax typed.
     */
    private price(
        lines: LineInput[],
        profile: TaxProfile,
        gst: BillToGst,
        typedTax: string,
    ): BuiltDocument {
        if (lines.length === 0) {
            fieldError("An invoice needs at least one line", "lines");
        }
        for (const line of lines) {
            if (line.gstRate && !isGstRate(line.gstRate)) {
                fieldError(
                    `${line.gstRate}% is not a GST rate. Use 0, 0.25, 3, 5, 12, 18, 28 or 40.`,
                    "lines",
                );
            }
        }
        const doc = buildManualInvoice(
            lines.map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitCents: toCents(l.unitPrice),
                rateBps: rateToBps(l.gstRate ?? null),
                code: l.hsnSac ?? null,
            })),
            profile,
            gst.billToState,
            profile.registered ? 0 : toCents(typedTax),
        );
        if (doc.totalCents > MAX_CENTS) {
            fieldError(
                "That total is larger than an invoice can hold",
                "lines",
            );
        }
        return doc;
    }

    /**
     * The bill-to GST details, from the DTO over what the draft had. A GSTIN
     * is checked (shape, state, check character) and brings its state with
     * it when none is given; a state is kept as its GST code.
     */
    private billToGst(dto: InvoiceInputDto, current: BillToGst): BillToGst {
        const pick = (v: string | undefined, was: string | null) =>
            v === undefined ? was : v === "" ? null : v;
        const gstin = pick(dto.billToGstin, current.billToGstin);
        let state = pick(dto.billToState, current.billToState);
        if (state !== null) {
            const code = stateCode(state);
            if (!code) fieldError("That is not a state we know", "billToState");
            state = code;
        }
        if (gstin !== null) {
            const problem = gstinProblem(gstin, state);
            if (problem) fieldError(problem, "billToGstin");
            state = state ?? gstin.slice(0, 2);
        }
        return {
            billToGstin: gstin,
            billToState: state,
            billToAddress: pick(dto.billToAddress, current.billToAddress),
        };
    }

    private async voidInTx(
        tx: Tx,
        organizationId: string,
        id: string,
        reason: string,
    ): Promise<void> {
        const row = await tx.invoice.findFirst({
            where: { id, organizationId },
            select: {
                status: true,
                kind: true,
                orderId: true,
                bookingId: true,
                sellerGstin: true,
            },
        });
        if (!row) notFound();
        if (row.orderId || row.bookingId) {
            throw new ConflictException(
                row.orderId
                    ? "This invoice belongs to an order. Refund or change the order instead."
                    : "This invoice belongs to a booking. Cancel the booking instead.",
            );
        }
        if (row.kind !== "INVOICE") {
            throw new ConflictException(
                "A credit note or supplementary invoice stands once issued.",
            );
        }
        if (row.status !== "ISSUED") {
            throw new ConflictException(this.notIssued(row.status, "voided"));
        }
        // A GST-registered business never voids an issued invoice: a void
        // leaves a hole in the series. It credits it instead (ADR-008).
        const profile = await loadTaxProfile(tx, organizationId);
        if (row.sellerGstin || profile.registered) {
            throw new ConflictException(
                "A GST invoice cannot be voided once issued. Cancel it with a credit note instead.",
            );
        }
        // A void invoice is not to be paid, so its pay link stops working.
        const { count } = await tx.invoice.updateMany({
            where: { id, organizationId, status: "ISSUED" },
            data: {
                status: "VOID",
                voidedAt: new Date(),
                voidReason: reason,
                payTokenHash: null,
                payLinkCreatedAt: null,
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
        const [connected, link, intents, charging] = await Promise.all([
            prisma.merchantPaymentProvider.count({
                where: { organizationId, status: "CONNECTED" },
            }),
            prisma.invoice.findFirst({
                where: { id: invoiceId, organizationId },
                select: {
                    payTokenHash: true,
                    payLinkCreatedAt: true,
                    subscriptionId: true,
                },
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
            chargeUnderWayOn(prisma, organizationId, invoiceId),
        ]);
        // Why its link can't take payment (#835): the plan before the
        // provider, so the panel never says "connect one" when the plan
        // is what stands in the way.
        const onlineBlocker = await invoiceOnlineBlocker(
            prisma,
            organizationId,
            link,
        );
        return {
            autopayCharge: charging ? { at: charging.at.toISOString() } : null,
            onlineBlocker,
            providerConnected: connected > 0,
            payLinkActive: Boolean(link?.payTokenHash),
            // When the link that is out was made; never the token (#870).
            payLinkMadeAt:
                link?.payTokenHash && link.payLinkCreatedAt
                    ? link.payLinkCreatedAt.toISOString()
                    : null,
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

    /**
     * An order's paper is the order's: paid, refunded and changed there
     * (ADR-008). A credit note or supplementary invoice stands as issued.
     */
    private assertOwnPaper(invoice: InvoiceViewModel, verb: string): void {
        if (invoice.order) {
            throw new ConflictException(
                `This invoice is for order ${invoice.order.number}, so it is not ${verb}. Use the order.`,
            );
        }
        if (invoice.kind === "CREDIT_NOTE") {
            throw new ConflictException(`A credit note is not ${verb}.`);
        }
    }

    private assertDraft(status: string, verb: string): void {
        if (status === "DRAFT") return;
        throw new ConflictException(
            status === "VOID"
                ? `A void invoice cannot be ${verb}.`
                : `An issued invoice is never ${verb === "deleted" ? "deleted" : "changed"}. Cancel it with a credit note, or correct it with a new invoice.`,
        );
    }

    private notIssued(status: string, verb: string): string {
        if (status === "DRAFT")
            return `Issue the invoice before it is ${verb}.`;
        if (status === "PAID") return `This invoice is already paid.`;
        if (status === "CREDITED") return `This invoice was credited.`;
        return `A void invoice cannot be ${verb}.`;
    }
}
