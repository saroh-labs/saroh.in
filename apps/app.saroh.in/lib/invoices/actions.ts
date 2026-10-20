"use server";

import { revalidatePath } from "next/cache";

import { linesWithRates } from "./line-rates";
import type { ReminderAsk } from "./remind-all";
import type { InvoiceInput, PaymentInput, ShareAsk } from "./service";
import * as api from "./service";

/** Thin: the API decides who may and what an invoice may become. */

function refresh(id?: string) {
    revalidatePath("/billing/invoices");
    if (id) revalidatePath(`/billing/invoices/${id}`);
    // Subscriptions show what their invoices still owe.
    revalidatePath("/billing/subscriptions");
}

/**
 * Money on an invoice moved: Home's owed figures and cheques line, and the
 * customer's page, read it too.
 */
function refreshMoney(id: string) {
    refresh(id);
    revalidatePath("/");
    revalidatePath("/contacts", "layout");
}

export async function createInvoice(input: InvoiceInput) {
    const res = await api.createInvoice(input);
    if (res.ok) refresh();
    return res;
}

/**
 * The editor's later saves, made as it is typed (`use-invoice-draft.ts`),
 * revalidate nothing, not even the list's path. Any revalidation makes the
 * router read the page it is on again, and once a new draft has its own
 * address (`/<id>/edit`) that is another page than the one drawn (`/new`):
 * the editor was thrown away and drawn again on its second save, closing
 * a phone's Style sheet under the finger, with whatever else was open or
 * focused (20 Oct). The first save (`createInvoice`) still revalidates, on
 * `/new`, where the page read again is the one drawn. A screen opened
 * afterwards reads the draft from the API (no fetch is cached,
 * `lib/api/http.ts`); one brought back by the browser's Back can show it
 * as it was until it is read again.
 */
export async function updateInvoice(id: string, input: InvoiceInput) {
    return api.updateInvoice(id, input);
}

export async function deleteInvoice(id: string) {
    const res = await api.deleteInvoice(id);
    if (res.ok) refresh();
    return res;
}

/**
 * Fill in the GST rates chosen for a draft's lines, by their place, and
 * leave every other line as it was: asked where Issue was refused for a
 * line with no rate (`use-gst-rate-step.tsx`). The draft is read again
 * here, so an edit made since the page was drawn is what the rates join.
 */
export async function setInvoiceLineRates(
    id: string,
    rates: Record<number, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const failed = {
        ok: false as const,
        error: "Couldn't save the GST rate. Try again.",
    };
    let invoice;
    try {
        invoice = await api.getInvoice(id);
    } catch {
        return failed;
    }
    if (!invoice?.lines?.length) return failed;
    const res = await api.updateInvoice(id, {
        lines: linesWithRates(invoice.lines, rates),
    });
    if (!res.ok) return { ok: false, error: res.error };
    refresh(id);
    return { ok: true };
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

export async function reissueInvoice(id: string, reason: string) {
    const res = await api.reissueInvoice(id, reason);
    if (res.ok) refresh(id);
    return res;
}

/** The sheet's preview of the credit note: a read, nothing revalidated. */
export async function readCreditPreview(id: string) {
    return api.readCreditPreview(id);
}

/** Cancel and write a correct one: the invoice, its credit note and the draft. */
export async function creditAndRewriteInvoice(id: string, reason: string) {
    const res = await api.creditAndRewriteInvoice(id, reason);
    if (res.ok) refresh(id);
    return res;
}

/** Write a void invoice again: a draft with its lines. */
export async function writeInvoiceAgain(id: string) {
    const res = await api.writeInvoiceAgain(id);
    if (res.ok) refresh(id);
    return res;
}

/**
 * One invoice, for Record payment opened with only its id (the customer's
 * Invoices tab). A read, so nothing is revalidated; a failure comes back as
 * a message to show.
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

/** Record money taken by hand: all that is left, part of it, or a cheque. */
export async function recordPayment(id: string, input: PaymentInput) {
    const res = await api.recordPayment(id, input);
    if (res.ok) refreshMoney(id);
    return res;
}

/** Remove a payment recorded by mistake (DEC-173); kept in the history. */
export async function removePayment(
    id: string,
    paymentId: string,
    reason?: string,
) {
    const res = await api.removePayment(id, paymentId, reason);
    if (res.ok) refreshMoney(id);
    return res;
}

/** A waiting cheque is in the bank. */
export async function chequeCleared(
    id: string,
    paymentId: string,
    clearedAt?: string,
) {
    const res = await api.chequeCleared(id, paymentId, clearedAt);
    if (res.ok) refreshMoney(id);
    return res;
}

/** A waiting cheque bounced: what it paid is owed again. */
export async function chequeBounced(
    id: string,
    paymentId: string,
    input: { bouncedAt?: string; reason?: string } = {},
) {
    const res = await api.chequeBounced(id, paymentId, input);
    if (res.ok) refreshMoney(id);
    return res;
}

/** Share it by hand: WhatsApp, a link, the PDF, print, or a receipt by email. */
export async function shareInvoice(id: string, ask: ShareAsk) {
    const res = await api.shareInvoice(id, ask);
    if (res.ok) refresh(id);
    return res;
}

export async function createPayLink(id: string) {
    const res = await api.createPayLink(id);
    if (res.ok) refresh(id);
    return res;
}

export async function createViewLink(id: string) {
    const res = await api.createViewLink(id);
    if (res.ok) refresh(id);
    return res;
}

export async function sendInvoice(id: string) {
    const res = await api.sendInvoice(id);
    if (res.ok) refresh(id);
    return res;
}

export async function remindInvoice(id: string) {
    const res = await api.remindInvoice(id);
    if (res.ok) refresh(id);
    return res;
}

/** Remind all's list (Home plan U8): a read, through an action for the sheet. */
export async function previewReminders(ask: ReminderAsk) {
    return api.previewReminders(ask);
}

/** Remind all: Home and the invoices read again, with the reminders sent. */
export async function sendReminders(ask: ReminderAsk) {
    const res = await api.sendReminders(ask);
    if (res.ok) {
        refresh();
        revalidatePath("/");
    }
    return res;
}
