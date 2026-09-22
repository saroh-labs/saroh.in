"use server";

import { revalidatePath } from "next/cache";

import type { InvoiceInput, PaymentInput } from "./service";
import * as api from "./service";

/** Thin: the API decides who may and what an invoice may become. */

function refresh(id?: string) {
    revalidatePath("/invoices");
    if (id) revalidatePath(`/invoices/${id}`);
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
