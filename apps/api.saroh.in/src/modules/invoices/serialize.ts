import { toMoneyString } from "../../common/money";
import type { InvoiceStanding } from "./invoice-state";
import { invoiceStanding } from "./invoice-state";

interface Money {
    toString(): string;
}

/** What a list row and a detail read both need, without the lines. */
export const INVOICE_SELECT = {
    id: true,
    number: true,
    status: true,
    contactId: true,
    contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    billToName: true,
    billToEmail: true,
    currency: true,
    subtotal: true,
    tax: true,
    total: true,
    issuedAt: true,
    dueAt: true,
    paidAt: true,
    voidedAt: true,
    voidReason: true,
    paymentMethod: true,
    paymentReference: true,
    paymentNote: true,
    source: true,
    subscriptionId: true,
    periodStart: true,
    periodEnd: true,
    courseEnrollmentId: true,
    packPurchaseId: true,
    reissuedFromId: true,
    reissues: { select: { id: true }, take: 1 },
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
} as const;

/**
 * The list adds its first line and how many there are — enough to say what
 * an invoice is for ("Personal training × 4") without sending every line.
 */
export const INVOICE_LIST_SELECT = {
    ...INVOICE_SELECT,
    lines: {
        orderBy: { position: "asc" },
        take: 1,
        select: { description: true, quantity: true },
    },
    _count: { select: { lines: true } },
} as const;

export const INVOICE_DETAIL_SELECT = {
    ...INVOICE_SELECT,
    lines: {
        orderBy: { position: "asc" },
        select: {
            id: true,
            position: true,
            description: true,
            quantity: true,
            unitPrice: true,
            amount: true,
        },
    },
} as const;

interface ContactRow {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
}

export interface InvoiceRow {
    id: string;
    number: string | null;
    status: string;
    contactId: string | null;
    contact: ContactRow | null;
    billToName: string | null;
    billToEmail: string | null;
    currency: string;
    subtotal: Money;
    tax: Money;
    total: Money;
    issuedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
    voidedAt: Date | null;
    voidReason: string | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNote: string | null;
    source: string;
    subscriptionId: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    courseEnrollmentId: string | null;
    packPurchaseId: string | null;
    reissuedFromId: string | null;
    reissues: { id: string }[];
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    lines?: {
        id?: string;
        position?: number;
        description: string;
        quantity: number;
        unitPrice?: Money;
        amount?: Money;
    }[];
    _count?: { lines: number };
}

export interface InvoiceLineView {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
}

export interface InvoiceViewModel {
    id: string;
    number: string | null;
    status: string;
    /** The status as the merchant reads it: Overdue is derived, never stored. */
    standing: InvoiceStanding;
    contact: { id: string; name: string; email: string } | null;
    /** Who it was billed to when it was issued; null on a draft. */
    billTo: { name: string | null; email: string | null } | null;
    currency: string;
    subtotal: string;
    tax: string;
    total: string;
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
    voidedAt: string | null;
    voidReason: string | null;
    payment: {
        method: string;
        reference: string | null;
        note: string | null;
    } | null;
    source: string;
    subscriptionId: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    courseEnrollmentId: string | null;
    packPurchaseId: string | null;
    reissuedFromId: string | null;
    /** The draft that replaced this one, when it was voided and reissued. */
    reissuedAsId: string | null;
    /** Issued by Saroh, not a person: a subscription renewal. */
    issuedAutomatically: boolean;
    createdAt: string;
    updatedAt: string;
    /** What it is for, from its first line; on lists and details alike. */
    summary: {
        description: string;
        quantity: number;
        lineCount: number;
    } | null;
    /** On a detail read only. */
    lines?: InvoiceLineView[];
    /** On `GET /invoices/:id` only: the pay link and money taken online. */
    online?: InvoiceOnlineView;
}

/** One payment taken online through the invoice's pay link (U13). */
export interface InvoiceOnlinePayment {
    id: string;
    provider: string;
    /** Major units, as a string. */
    amount: string;
    currency: string;
    at: string;
    /**
     * False when it came in after the invoice was already paid or void: it
     * was captured but not applied, and is owed back to the customer.
     */
    applied: boolean;
    refund: "NONE" | "PENDING" | "REFUNDED";
}

export interface InvoiceOnlineView {
    /** A provider is connected, so a pay link can take payment. */
    providerConnected: boolean;
    /** A link is out; the token itself is never read back. */
    payLinkActive: boolean;
    payments: InvoiceOnlinePayment[];
}

/** "Asha Rao", or the email when the contact has no name. */
export function contactName(c: {
    firstName: string | null;
    lastName: string | null;
    email: string;
}): string {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return name || c.email;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function serializeInvoice(
    row: InvoiceRow,
    now: Date,
    { detail = false }: { detail?: boolean } = {},
): InvoiceViewModel {
    const first = row.lines?.[0];
    return {
        id: row.id,
        number: row.number,
        status: row.status,
        standing: invoiceStanding(row, now),
        contact: row.contact
            ? {
                  id: row.contact.id,
                  name: contactName(row.contact),
                  email: row.contact.email,
              }
            : null,
        billTo:
            row.status === "DRAFT"
                ? null
                : { name: row.billToName, email: row.billToEmail },
        currency: row.currency,
        subtotal: toMoneyString(row.subtotal),
        tax: toMoneyString(row.tax),
        total: toMoneyString(row.total),
        issuedAt: iso(row.issuedAt),
        dueAt: iso(row.dueAt),
        paidAt: iso(row.paidAt),
        voidedAt: iso(row.voidedAt),
        voidReason: row.voidReason,
        payment: row.paymentMethod
            ? {
                  method: row.paymentMethod,
                  reference: row.paymentReference,
                  note: row.paymentNote,
              }
            : null,
        source: row.source,
        subscriptionId: row.subscriptionId,
        periodStart: iso(row.periodStart),
        periodEnd: iso(row.periodEnd),
        courseEnrollmentId: row.courseEnrollmentId,
        packPurchaseId: row.packPurchaseId,
        reissuedFromId: row.reissuedFromId,
        reissuedAsId: row.reissues[0]?.id ?? null,
        issuedAutomatically:
            row.status !== "DRAFT" && row.createdByUserId === null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        summary: first
            ? {
                  description: first.description,
                  quantity: first.quantity,
                  lineCount: row._count?.lines ?? row.lines?.length ?? 1,
              }
            : null,
        ...(detail && row.lines
            ? {
                  lines: row.lines.map((l) => ({
                      id: l.id ?? "",
                      description: l.description,
                      quantity: l.quantity,
                      unitPrice: toMoneyString(l.unitPrice ?? "0"),
                      amount: toMoneyString(l.amount ?? "0"),
                  })),
              }
            : {}),
    };
}
