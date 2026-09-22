import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";

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
export type InvoiceStanding = "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID";
export type InvoiceSource = "MANUAL" | "SUBSCRIPTION" | "COURSE" | "PACK";
export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";

export interface InvoiceLine {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
}

export interface Invoice {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    standing: InvoiceStanding;
    /** Null once the contact is deleted; the bill-to keeps who it was for. */
    contact: { id: string; name: string; email: string } | null;
    /** Copied on issue; null on a draft. */
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
        method: PaymentMethod;
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
}

export interface InvoiceInput {
    contactId?: string;
    currency?: string;
    lines?: { description: string; quantity: number; unitPrice: string }[];
    tax?: string;
    dueAt?: string | null;
}

export interface PaymentInput {
    method: PaymentMethod;
    reference?: string;
    note?: string;
    paidAt?: string;
}

export async function listInvoices(): Promise<Invoice[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Invoice[]>(`${base}/invoices`)) ?? [];
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
