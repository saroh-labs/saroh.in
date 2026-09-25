"use server";

import { revalidatePath } from "next/cache";

import type { InvoiceInput, PaymentInput } from "./service";
import * as api from "./service";

/** Thin: the API decides who may and what an invoice may become. */

function refresh(id?: string) {
    revalidatePath("/billing/invoices");
    if (id) revalidatePath(`/billing/invoices/${id}`);
    // Subscriptions show what their invoices still owe.
    revalidatePath("/billing/subscriptions");
}

export async function createInvoice(input: InvoiceInput) {
    const res = await api.createInvoice(input);
    if (res.ok) refresh();
    return res;
}

export async function updateInvoice(id: string, input: InvoiceInput) {
    const res = await api.updateInvoice(id, input);
    if (res.ok) refresh(id);
    return res;
}

export async function deleteInvoice(id: string) {
    const res = await api.deleteInvoice(id);
    if (res.ok) refresh();
    return res;
}

export async function issueInvoice(id: string) {
    const res = await api.issueInvoice(id);
    if (res.ok) refresh(id);
    return res;
}

export async function voidInvoice(id: string, reason: string) {
    const res = await api.voidInvoice(id, reason);
    if (res.ok) refresh(id);
    return res;
}

export async function creditInvoice(id: string, reason: string) {
    const res = await api.creditInvoice(id, reason);
    if (res.ok) refresh(id);
    return res;
}

/**
 * One invoice with its lines, for a quick look opened from a list. A read,
 * so nothing is revalidated; a failure comes back as a message to show.
 */
export async function readInvoice(id: string) {
    try {
        const invoice = await api.getInvoice(id);
        return invoice
            ? ({ ok: true, data: invoice } as const)
            : ({
                  ok: false,
                  error: "That invoice is not here any more.",
              } as const);
    } catch {
        return {
            ok: false,
            error: "That invoice could not be loaded.",
        } as const;
    }
}

export async function reissueInvoice(id: string, reason: string) {
    const res = await api.reissueInvoice(id, reason);
    if (res.ok) refresh(id);
    return res;
}

export async function recordPayment(id: string, input: PaymentInput) {
    const res = await api.recordPayment(id, input);
    if (res.ok) refresh(id);
    return res;
}

export async function createPayLink(id: string) {
    const res = await api.createPayLink(id);
    if (res.ok) refresh(id);
    return res;
}
