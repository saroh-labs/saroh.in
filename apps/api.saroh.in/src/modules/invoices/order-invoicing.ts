import type { Prisma } from "@saroh/database";

import { bpsToRate, rateToBps } from "./gst";
import { stateName } from "./gst-states";
import type { InvoiceKind } from "./numbering";
import { nextInvoiceNumber, seriesFor } from "./numbering";
import type {
    BillTo,
    BuiltDocument,
    Original,
    TaxProfile,
} from "./order-invoice";
import {
    buildCorrection,
    buildCreditNote,
    buildOrderInvoice,
    formatSellerAddress,
    orderBillTo,
} from "./order-invoice";
import { fromCents, toCents } from "./totals";

/**
 * An invoice for every order, and the paper that corrects it (ADR-008) —
 * written on the caller's transaction, so a rolled-back payment leaves no
 * invoice and no number behind.
 *
 * Plain functions, not a service: the webhook's reconciliation, the order
 * service, the kitchen edit and the refund path all call them inside their
 * own transactions, and none of them should need the others to do it.
 *
 * The order is the ledger. Its invoice is written PAID when the order is,
 * never has a pay link, and is left out of "owed" (an unpaid order is owed on
 * the order). A refund makes a credit note; an edit up a supplementary
 * invoice. The invoice itself never changes after it is written — except its
 * status following the order's (a full refund marks it CREDITED).
 */

type Tx = Prisma.TransactionClient;

/** The business's GST standing. A business without a profile is unregistered. */
export async function loadTaxProfile(
    tx: Pick<Tx, "businessProfile">,
    organizationId: string,
): Promise<TaxProfile> {
    const p = await tx.businessProfile.findUnique({
        where: { organizationId },
        select: {
            gstRegistered: true,
            gstState: true,
            taxId: true,
            invoicePrefix: true,
            timezone: true,
            deliveryGstRate: true,
            deliverySacCode: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postalCode: true,
        },
    });
    return {
        registered: Boolean(p?.gstRegistered && p.taxId && p.gstState),
        gstin: p?.taxId ? p.taxId.trim().toUpperCase() : null,
        state: p?.gstState ?? null,
        prefix: p?.invoicePrefix ?? null,
        timezone: p?.timezone ?? null,
        deliveryRateBps: rateToBps(p?.deliveryGstRate ?? "18") ?? 1800,
        deliverySac: p?.deliverySacCode ?? null,
        address: p
            ? formatSellerAddress({ ...p, stateName: stateName(p.gstState) })
            : null,
    };
}

/** Whether the business issues tax invoices (and ignores add-on tax). */
export async function isGstRegistered(
    tx: Pick<Tx, "businessProfile">,
    organizationId: string,
): Promise<boolean> {
    return (await loadTaxProfile(tx, organizationId)).registered;
}

/** The number a new document takes, in its kind's series. */
export async function numberFor(
    tx: Pick<Tx, "invoiceSequence">,
    organizationId: string,
    profile: TaxProfile,
    kind: InvoiceKind,
    at: Date,
): Promise<string> {
    return nextInvoiceNumber(
        tx,
        organizationId,
        seriesFor({
            registered: profile.registered,
            prefix: profile.prefix,
            kind,
            at,
            timezone: profile.timezone,
        }),
    );
}

/** The header columns a built document writes. */
export function documentColumns(doc: BuiltDocument) {
    return {
        subtotal: fromCents(doc.subtotalCents),
        tax: fromCents(doc.taxCents),
        total: fromCents(doc.totalCents),
        cgst: fromCents(doc.cgstCents),
        sgst: fromCents(doc.sgstCents),
        igst: fromCents(doc.igstCents),
        placeOfSupply: doc.placeOfSupply,
        taxType: doc.taxType,
        sellerGstin: doc.sellerGstin,
        sellerState: doc.sellerState,
        sellerAddress: doc.sellerAddress,
    };
}

/** Its lines, with the tax each carries. */
export async function writeDocumentLines(
    tx: Pick<Tx, "invoiceLine">,
    organizationId: string,
    invoiceId: string,
    doc: BuiltDocument,
): Promise<void> {
    const receipt = doc.sellerGstin === null;
    await tx.invoiceLine.createMany({
        data: doc.lines.map((l, position) => ({
            organizationId,
            invoiceId,
            position,
            description: l.description,
            quantity: l.quantity,
            unitPrice: fromCents(l.unitCents),
            amount: fromCents(l.amountCents),
            discount: fromCents(l.discountCents),
            hsnSac: receipt ? null : l.code,
            gstRate:
                receipt || l.rateBps === null ? null : bpsToRate(l.rateBps),
            taxableValue:
                l.taxableCents === null ? null : fromCents(l.taxableCents),
            cgst: fromCents(l.cgstCents),
            sgst: fromCents(l.sgstCents),
            igst: fromCents(l.igstCents),
            orderItemId: l.orderItemId ?? null,
        })),
    });
}

function billToColumns(billTo: BillTo) {
    return {
        billToName: billTo.name,
        billToEmail: billTo.email,
        billToAddress: billTo.address,
        billToState: billTo.state,
    };
}

/**
 * The order's invoice, made once. Returns the one already there when there
 * is one — a replayed webhook, a second payment on an edited order, or a
 * payment recorded by hand after the webhook — so calling it twice is safe.
 *
 * Takes the order's row lock first: two deliveries for one payment
 * (Razorpay sends `payment.captured` and `order.paid`) queue here, and the
 * second finds the first's invoice. A partial unique index backs it up.
 *
 * An order with no business (from before ADR-001) gets no invoice.
 */
export async function ensureOrderInvoice(
    tx: Tx,
    orderId: string,
    opts: { at?: Date; method?: string | null; reference?: string | null } = {},
): Promise<{ id: string; number: string | null; created: boolean } | null> {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const existing = await tx.invoice.findFirst({
        where: { orderId, kind: "INVOICE" },
        select: { id: true, number: true },
    });
    if (existing) return { ...existing, created: false };

    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
            organizationId: true,
            orderId: true,
            currency: true,
            subtotal: true,
            tax: true,
            shipping: true,
            discount: true,
            total: true,
            fulfilment: true,
            deliveryName: true,
            deliveryLine1: true,
            deliveryLine2: true,
            deliveryCity: true,
            deliveryState: true,
            deliveryPostalCode: true,
            customer: {
                select: { firstName: true, lastName: true, email: true },
            },
            items: {
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    quantity: true,
                    price: true,
                    product: {
                        select: { name: true, gstRate: true, hsnCode: true },
                    },
                    variant: { select: { title: true } },
                },
            },
        },
    });
    if (!order?.organizationId || order.items.length === 0) return null;
    const organizationId = order.organizationId;

    const profile = await loadTaxProfile(tx, organizationId);
    const doc = buildOrderInvoice(order, profile);
    const at = opts.at ?? new Date();
    const number = await numberFor(tx, organizationId, profile, "INVOICE", at);
    const created = await tx.invoice.create({
        data: {
            organizationId,
            kind: "INVOICE",
            status: "PAID",
            number,
            source: "ORDER",
            orderId,
            ...billToColumns(orderBillTo(order)),
            currency: order.currency,
            ...documentColumns(doc),
            issuedAt: at,
            // Never due: the order is where it is paid.
            dueAt: null,
            paidAt: at,
            paymentMethod: opts.method ?? "ORDER",
            paymentReference: opts.reference ?? null,
            paymentNote: `Paid on order ${order.orderId}`,
        },
        select: { id: true },
    });
    await writeDocumentLines(tx, organizationId, created.id, doc);
    return { id: created.id, number, created: true };
}

const ORIGINAL_SELECT = {
    id: true,
    organizationId: true,
    orderId: true,
    currency: true,
    status: true,
    sellerGstin: true,
    sellerState: true,
    sellerAddress: true,
    placeOfSupply: true,
    taxType: true,
    tax: true,
    total: true,
    billToName: true,
    billToEmail: true,
    billToAddress: true,
    billToState: true,
    billToGstin: true,
    contactId: true,
    lines: {
        orderBy: { position: "asc" },
        select: {
            description: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            gstRate: true,
            hsnSac: true,
            orderItemId: true,
        },
    },
} as const satisfies Prisma.InvoiceSelect;

type OriginalRow = Prisma.InvoiceGetPayload<{ select: typeof ORIGINAL_SELECT }>;

/** What of an invoice is still there to credit: its total less its credit notes. */
async function creditable(tx: Tx, original: OriginalRow): Promise<number> {
    const credited = await tx.invoice.aggregate({
        where: { relatedInvoiceId: original.id, kind: "CREDIT_NOTE" },
        _sum: { total: true },
    });
    const supplementary = await tx.invoice.aggregate({
        where: { relatedInvoiceId: original.id, kind: "SUPPLEMENTARY" },
        _sum: { total: true },
    });
    return (
        toCents(original.total.toString()) +
        toCents((supplementary._sum.total ?? 0).toString()) -
        toCents((credited._sum.total ?? 0).toString())
    );
}

/**
 * Every line invoiced against an original: its own, then those of its
 * supplementary invoices (units an edit added), oldest first. A credit
 * note itemises and spreads over these, so a line an edit added is
 * credited at its own rate, and the spread can reach all of
 * {@link creditable}.
 */
async function invoicedLines(
    tx: Tx,
    original: OriginalRow,
): Promise<OriginalRow["lines"]> {
    const supplementary = await tx.invoiceLine.findMany({
        where: {
            invoice: { relatedInvoiceId: original.id, kind: "SUPPLEMENTARY" },
        },
        orderBy: [{ invoice: { createdAt: "asc" } }, { position: "asc" }],
        select: ORIGINAL_SELECT.lines.select,
    });
    return [...original.lines, ...supplementary];
}

/** Write a correction (credit note or supplementary invoice) against an original. */
async function writeCorrection(
    tx: Tx,
    original: OriginalRow,
    kind: "CREDIT_NOTE" | "SUPPLEMENTARY",
    doc: BuiltDocument,
    extra: {
        paymentRefundId?: string | null;
        note?: string | null;
        createdByUserId?: string | null;
        status: "ISSUED" | "PAID";
        at: Date;
    },
): Promise<{ id: string; number: string }> {
    const profile = await loadTaxProfile(tx, original.organizationId);
    // The series follows the business now; the paper follows the original.
    const number = await numberFor(
        tx,
        original.organizationId,
        { ...profile, registered: original.sellerGstin !== null },
        kind,
        extra.at,
    );
    const created = await tx.invoice.create({
        data: {
            organizationId: original.organizationId,
            kind,
            status: extra.status,
            number,
            source: original.orderId ? "ORDER" : "MANUAL",
            relatedInvoiceId: original.id,
            orderId: original.orderId,
            contactId: original.contactId,
            paymentRefundId: extra.paymentRefundId ?? null,
            billToName: original.billToName,
            billToEmail: original.billToEmail,
            billToAddress: original.billToAddress,
            billToState: original.billToState,
            billToGstin: original.billToGstin,
            currency: original.currency,
            ...documentColumns(doc),
            issuedAt: extra.at,
            dueAt: null,
            paidAt: extra.status === "PAID" ? extra.at : null,
            paymentNote: extra.note ?? null,
            createdByUserId: extra.createdByUserId ?? null,
        },
        select: { id: true },
    });
    await writeDocumentLines(tx, original.organizationId, created.id, doc);
    return { id: created.id, number };
}

function asOriginal(row: OriginalRow): Original {
    return {
        sellerGstin: row.sellerGstin,
        sellerState: row.sellerState,
        sellerAddress: row.sellerAddress,
        placeOfSupply: row.placeOfSupply,
        taxType: row.taxType,
        tax: row.tax,
        total: row.total,
        lines: row.lines,
    };
}

/**
 * A credit note against an issued invoice for `amountCents`, capped at what
 * is still there to credit. Lines itemise the refund when it names order
 * lines; otherwise the amount is spread over the invoice's lines.
 *
 * Idempotent per refund: a refund that already made its credit note returns
 * it. Takes the original invoice's row lock, so the refund path and the
 * refund webhook racing for one refund make one note. Returns null when
 * nothing is left to credit.
 */
export async function issueCreditNote(
    tx: Tx,
    input: {
        invoiceId: string;
        amountCents: number;
        refundLines?: {
            orderItemId: string;
            quantity: number;
            amountCents: number;
        }[];
        paymentRefundId?: string | null;
        note?: string | null;
        createdByUserId?: string | null;
        at?: Date;
    },
): Promise<{ id: string; number: string | null } | null> {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${input.invoiceId} FOR UPDATE`;
    if (input.paymentRefundId) {
        const made = await tx.invoice.findUnique({
            where: { paymentRefundId: input.paymentRefundId },
            select: { id: true, number: true },
        });
        if (made) return made;
    }
    const original = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: ORIGINAL_SELECT,
    });
    if (!original) return null;
    const left = await creditable(tx, original);
    const amountCents = Math.min(input.amountCents, left);
    if (amountCents <= 0) return null;

    const doc = buildCreditNote(
        { ...asOriginal(original), lines: await invoicedLines(tx, original) },
        amountCents,
        amountCents === input.amountCents ? input.refundLines : [],
    );
    const note = await writeCorrection(tx, original, "CREDIT_NOTE", doc, {
        paymentRefundId: input.paymentRefundId,
        note: input.note,
        createdByUserId: input.createdByUserId,
        status: "ISSUED",
        at: input.at ?? new Date(),
    });
    // Credited in full: the invoice reads CREDITED from now on.
    if (amountCents === left) {
        await tx.invoice.updateMany({
            where: {
                id: original.id,
                status: { in: ["ISSUED", "PAID"] },
            },
            data: { status: "CREDITED", payTokenHash: null },
        });
    }
    return note;
}

/**
 * The credit note a refund makes on its order's invoice (ADR-008). Nothing
 * when the order has no invoice (it was placed before U5), when the refund
 * already made one, or when it hands back an edit's difference — the edit
 * wrote its own credit note.
 */
export async function creditNoteForRefund(
    tx: Tx,
    paymentRefundId: string,
): Promise<{ id: string; number: string | null } | null> {
    const refund = await tx.paymentRefund.findUnique({
        where: { id: paymentRefundId },
        select: {
            id: true,
            amountCents: true,
            forEdit: true,
            reason: true,
            status: true,
            paymentIntent: { select: { orderId: true } },
            lines: {
                select: {
                    orderItemId: true,
                    quantity: true,
                    amountCents: true,
                },
            },
        },
    });
    if (!refund || refund.forEdit || refund.status === "FAILED") return null;
    const orderId = refund.paymentIntent.orderId;
    if (!orderId) return null;
    const invoice = await tx.invoice.findFirst({
        where: { orderId, kind: "INVOICE" },
        select: { id: true },
    });
    if (!invoice) return null;
    return issueCreditNote(tx, {
        invoiceId: invoice.id,
        amountCents: refund.amountCents,
        refundLines: refund.lines,
        paymentRefundId: refund.id,
        note: refund.reason ?? "Refund",
    });
}

/**
 * What an edit before preparing changed on a paid order's invoice: added
 * units make a supplementary invoice, removed ones a credit note — each at
 * the price and rate the line was bought at, referencing the order's
 * invoice. Never an edit to the invoice itself. Nothing when the order has
 * no invoice yet (unpaid: its invoice, when it comes, is the edited order).
 */
export async function correctOrderInvoiceForEdit(
    tx: Tx,
    input: {
        orderId: string;
        changes: {
            orderItemId: string | null;
            productId: string;
            description: string;
            deltaQuantity: number;
            unitCents: number;
        }[];
        note: string | null;
        createdByUserId: string | null;
        /** Paid already: the supplementary invoice is settled on the order. */
        settled: boolean;
    },
): Promise<{
    supplementary: { id: string; number: string } | null;
    creditNote: { id: string; number: string | null } | null;
}> {
    const none = { supplementary: null, creditNote: null };
    const invoice = await tx.invoice.findFirst({
        where: { orderId: input.orderId, kind: "INVOICE" },
        select: { id: true },
    });
    if (!invoice || input.changes.length === 0) return none;
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoice.id} FOR UPDATE`;
    const original = await tx.invoice.findUnique({
        where: { id: invoice.id },
        select: ORIGINAL_SELECT,
    });
    if (!original) return none;

    const products = await tx.product.findMany({
        where: { id: { in: input.changes.map((c) => c.productId) } },
        select: { id: true, gstRate: true, hsnCode: true },
    });
    const byProduct = new Map(products.map((p) => [p.id, p]));
    const line = (c: (typeof input.changes)[number], quantity: number) => ({
        description: c.description,
        quantity,
        unitCents: c.unitCents,
        rateBps: rateToBps(byProduct.get(c.productId)?.gstRate ?? null),
        code: byProduct.get(c.productId)?.hsnCode ?? null,
        orderItemId: c.orderItemId,
    });
    const up = input.changes
        .filter((c) => c.deltaQuantity > 0)
        .map((c) => line(c, c.deltaQuantity));
    const down = input.changes
        .filter((c) => c.deltaQuantity < 0)
        .map((c) => line(c, -c.deltaQuantity));
    const at = new Date();

    const supplementary =
        up.length > 0
            ? await writeCorrection(
                  tx,
                  original,
                  "SUPPLEMENTARY",
                  buildCorrection(original, up),
                  {
                      note: input.note,
                      createdByUserId: input.createdByUserId,
                      status: input.settled ? "PAID" : "ISSUED",
                      at,
                  },
              )
            : null;
    let creditNote: { id: string; number: string | null } | null = null;
    if (down.length > 0) {
        const doc = buildCorrection(original, down);
        const left = await creditable(tx, original);
        if (doc.totalCents > 0 && doc.totalCents <= left) {
            creditNote = await writeCorrection(
                tx,
                original,
                "CREDIT_NOTE",
                doc,
                {
                    note: input.note,
                    createdByUserId: input.createdByUserId,
                    status: "ISSUED",
                    at,
                },
            );
        }
    }
    return { supplementary, creditNote };
}

/**
 * The order took more money (an edit's difference was paid): its
 * supplementary invoices waiting on that are settled.
 */
export async function settleSupplementaryInvoices(
    tx: Pick<Tx, "invoice">,
    orderId: string,
    at: Date = new Date(),
): Promise<number> {
    const { count } = await tx.invoice.updateMany({
        where: { orderId, kind: "SUPPLEMENTARY", status: "ISSUED" },
        data: { status: "PAID", paidAt: at, paymentMethod: "ORDER" },
    });
    return count;
}

/**
 * The order was refunded in full: whatever of its invoice is left is
 * credited (a refund recorded by hand made no credit note of its own), and
 * the invoice reads CREDITED.
 */
export async function creditRestOfOrder(
    tx: Tx,
    orderId: string,
    note: string,
    createdByUserId: string | null,
): Promise<void> {
    const invoice = await tx.invoice.findFirst({
        where: { orderId, kind: "INVOICE" },
        select: { id: true },
    });
    if (!invoice) return;
    await issueCreditNote(tx, {
        invoiceId: invoice.id,
        amountCents: Number.MAX_SAFE_INTEGER,
        note,
        createdByUserId,
    });
    await tx.invoice.updateMany({
        where: {
            orderId,
            kind: { in: ["INVOICE", "SUPPLEMENTARY"] },
            status: "PAID",
        },
        data: { status: "CREDITED" },
    });
}
