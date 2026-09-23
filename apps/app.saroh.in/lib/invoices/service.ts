import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CappedList } from "@/lib/lists/capped";
import { withLive } from "@/lib/lists/capped";

/**
 * Invoices a business issues (ADR-007) — read and written through the
 * org-nested `/organizations/:id/invoices` routes. Server-only: `orgBase`
 * reads the active organization.
 *
 * Money arrives as decimal strings ("2596.00"); the API priced it in minor
 * units and the screens only display it.
 */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "VOID";
/** The status as the merchant reads it; Overdue is derived by the API. */
/** CREDITED: cancelled in full by a credit note (ADR-008). */
export type InvoiceStanding =
    "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID" | "CREDITED";
/** ORDER: an order's own invoice or a correction to it (ADR-008). */
export type InvoiceSource =
    "MANUAL" | "SUBSCRIPTION" | "COURSE" | "PACK" | "ORDER" | "BOOKING";
export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
/**
 * How a payment is stored: one of the ways it is recorded by hand, or ONLINE
 * — paid through the invoice's pay link, written by the payment webhook and
 * never offered in Record a payment.
 */
export type StoredPaymentMethod = PaymentMethod | "ONLINE";

/** One payment taken online through the invoice's pay link. */
export interface InvoiceOnlinePayment {
    id: string;
    provider: string;
    amount: string;
    currency: string;
    at: string;
    /**
     * False when it came in after the invoice was already paid or void: the
     * money was taken but not applied, and is owed back to the customer.
     */
    applied: boolean;
    refund: "NONE" | "PENDING" | "REFUNDED";
}

/** On the detail read: can a pay link take payment, and is one out. */
export interface InvoiceOnline {
    providerConnected: boolean;
    payLinkActive: boolean;
    payments: InvoiceOnlinePayment[];
}

/** INVOICE, or a correction to one: a credit note (down) or a supplementary invoice (up). */
export type InvoiceKind = "INVOICE" | "CREDIT_NOTE" | "SUPPLEMENTARY";

export interface InvoiceLine {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
    /** The order discount's share of this line (ADR-008). */
    discount?: string;
    /** On a tax invoice; null on a receipt. */
    gst?: {
        hsnSac: string | null;
        rate: string | null;
        taxableValue: string | null;
        cgst: string;
        sgst: string;
        igst: string;
    } | null;
    orderItemId?: string | null;
}

/** A tax invoice's GST, frozen when it was issued. Null on a receipt. */
export interface InvoiceGst {
    sellerGstin: string;
    sellerState: string | null;
    placeOfSupply: { code: string; name: string | null } | null;
    taxType: "INTRA" | "INTER";
    cgst: string;
    sgst: string;
    igst: string;
}

/** A credit note or supplementary invoice against this one. */
export interface InvoiceCorrection {
    id: string;
    number: string | null;
    kind: InvoiceKind;
    total: string;
}

export interface Invoice {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    standing: InvoiceStanding;
    /** Null once the contact is deleted; the bill-to keeps who it was for. */
    contact: { id: string; name: string; email: string } | null;
    /** Copied on issue; null on a draft. */
    billTo: {
        name: string | null;
        email: string | null;
        gstin?: string | null;
        state?: string | null;
        address?: string | null;
    } | null;
    /** Draft or issued, the bill-to GST details typed on it. */
    billToGst?: {
        gstin: string | null;
        state: string | null;
        address: string | null;
    };
    /** Absent from an API older than ADR-008: read it as INVOICE. */
    kind?: InvoiceKind;
    /** The invoice a credit note or supplementary invoice corrects. */
    related?: { id: string; number: string | null } | null;
    corrections?: InvoiceCorrection[];
    /** The order it bills: the order is the ledger, so it has no pay link. */
    order?: { id: string; number: string } | null;
    bookingId?: string | null;
    gst?: InvoiceGst | null;
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
        method: StoredPaymentMethod;
        reference: string | null;
        note: string | null;
    } | null;
    source: InvoiceSource;
    subscriptionId: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    courseEnrollmentId: string | null;
    packPurchaseId: string | null;
    reissuedFromId: string | null;
    reissuedAsId: string | null;
    /** Issued by Saroh, not a person: a subscription renewal. */
    issuedAutomatically: boolean;
    createdAt: string;
    updatedAt: string;
    /** Its first line and how many there are: what it is for, in a list. */
    summary: {
        description: string;
        quantity: number;
        lineCount: number;
    } | null;
    /** On a detail read only. */
    lines?: InvoiceLine[];
    /** On the detail read only; absent from an API that predates pay links. */
    online?: InvoiceOnline;
}

export interface InvoiceInput {
    contactId?: string;
    currency?: string;
    lines?: {
        description: string;
        quantity: number;
        unitPrice: string;
        /** Percent the price includes, on a registered business's invoice. */
        gstRate?: string;
        hsnSac?: string;
    }[];
    tax?: string;
    dueAt?: string | null;
    /** A registered buyer's GSTIN; "" clears it. */
    billToGstin?: string;
    /** The buyer's GST state code — the place of supply. "" clears it. */
    billToState?: string;
    billToAddress?: string;
}

export interface PaymentInput {
    method: PaymentMethod;
    reference?: string;
    note?: string;
    paidAt?: string;
}

/** The newest invoices, and every unpaid one however old (see `withLive`). */
export async function listInvoices(): Promise<CappedList<Invoice>> {
    const base = await orgBase();
    if (!base) return { rows: [], truncated: false };
    const [newest, issued, overdue] = await Promise.all([
        getJson<Invoice[]>(`${base}/invoices`),
        getJson<Invoice[]>(`${base}/invoices?view=issued`),
        getJson<Invoice[]>(`${base}/invoices?view=overdue`),
    ]);
    return withLive(newest ?? [], issued ?? [], overdue ?? []);
}

/** One contact's invoices, newest first: the Connected panel's "N more". */
export async function listInvoicesFor(contactId: string): Promise<Invoice[]> {
    const base = await orgBase();
    if (!base) return [];
    return (
        (await getJson<Invoice[]>(
            `${base}/invoices?contactId=${encodeURIComponent(contactId)}`,
        )) ?? []
    );
}

export async function getInvoice(id: string): Promise<Invoice | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<Invoice>(`${base}/invoices/${encodeURIComponent(id)}`);
}

async function send<T>(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}/invoices${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, fallback);
}

const at = (id: string) => `/${encodeURIComponent(id)}`;

export function createInvoice(input: InvoiceInput) {
    return send<Invoice>("", "POST", input, "Could not save that invoice.");
}

export function updateInvoice(id: string, input: InvoiceInput) {
    return send<Invoice>(
        at(id),
        "PATCH",
        input,
        "Could not save that invoice.",
    );
}

export function deleteInvoice(id: string) {
    return send<Record<string, never>>(
        at(id),
        "DELETE",
        undefined,
        "Could not delete that draft.",
    );
}

export function issueInvoice(id: string) {
    return send<Invoice>(
        `${at(id)}/issue`,
        "POST",
        {},
        "Could not issue that invoice.",
    );
}

/**
 * Cancel an issued or paid invoice with a credit note for all of it
 * (ADR-008) — how a GST-registered business undoes one. Answers with the
 * credit note.
 */
export function creditInvoice(id: string, reason: string) {
    return send<Invoice>(
        `${at(id)}/credit`,
        "POST",
        { reason },
        "Could not cancel that invoice.",
    );
}

export function voidInvoice(id: string, reason: string) {
    return send<Invoice>(
        `${at(id)}/void`,
        "POST",
        { reason },
        "Could not void that invoice.",
    );
}

/** Void it and open a corrected draft; answers with the draft. */
export function reissueInvoice(id: string, reason: string) {
    return send<Invoice>(
        `${at(id)}/reissue`,
        "POST",
        { reason },
        "Could not reissue that invoice.",
    );
}

export function recordPayment(id: string, input: PaymentInput) {
    return send<Invoice>(
        `${at(id)}/payments`,
        "POST",
        input,
        "Could not record that payment.",
    );
}

/**
 * Make the invoice's pay link. The answer is the only time the link is seen —
 * the API keeps only a hash of it — so asking again makes a new one and the
 * one shared before stops working.
 */
export function createPayLink(id: string) {
    return send<{ url: string }>(
        `${at(id)}/pay-link`,
        "POST",
        {},
        "Could not make a pay link.",
    );
}
