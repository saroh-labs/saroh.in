"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import { revalidatePath } from "next/cache";

import { linesWithRates } from "./line-rates";
import type { ReminderAsk } from "./remind-all";
import type {
    CreditExpect,
    InvoiceInput,
    PaymentInput,
    ShareAsk,
} from "./service";
import * as api from "./service";

/**
 * Thin: the API decides who may and what an invoice may become.
 *
 * Each write takes the tab's business last (`orgId`, from
 * `useInvoiceSave`) on Invoices' React Query screens: it then goes through
 * `writeAsOrg`, which refuses a moved tab and revalidates nothing, since
 * the screen reads its own queries again (DEC-259). Without it (a
 * customer's page or Home's older callers) it revalidates as before.
 */

type Path = [path: string, type?: "layout" | "page"];

function revalidate(paths: Path[]) {
    // rq-revalidate-ok: reached only by a write without orgId, from a server-rendered screen.
    for (const [path, type] of paths) revalidatePath(path, type);
}

function refresh(id?: string) {
    revalidate([
        ["/billing/invoices"],
        ...(id ? [[`/billing/invoices/${id}`] as Path] : []),
        // Subscriptions show what their invoices still owe.
        ["/billing/subscriptions"],
    ]);
}

/**
 * Money on an invoice moved: Home's owed figures and cheques line, and the
 * customer's page, read it too.
 */
function refreshMoney(id: string) {
    refresh(id);
    revalidate([["/"], ["/contacts", "layout"]]);
}

/**
 * The write as the tab's business when a React Query screen names it
 * (nothing revalidated), else as before: `after` once it landed.
 */
async function save<R extends { ok: boolean }>(
    orgId: string | undefined,
    write: () => Promise<R>,
    after?: () => void,
) {
    if (orgId) return writeAsOrg(orgId, write);
    const res = await write();
    if (res.ok) after?.();
    return res;
}

export async function createInvoice(input: InvoiceInput, orgId?: string) {
    return save(
        orgId,
        () => api.createInvoice(input),
        () => refresh(),
    );
}

/**
 * The editor's later saves, made as it is typed (`use-invoice-draft.ts`),
 * revalidate nothing, not even the list's path. Any revalidation makes the
 * router read the page it is on again, and once a new draft has its own
 * address (`/<id>/edit`) that is another page than the one drawn (`/new`):
 * the editor was thrown away and drawn again on its second save, closing
 * a phone's Style sheet under the finger, with whatever else was open or
 * focused (20 Oct). From Invoices' screens no save revalidates (`orgId`):
 * the editor holds its own draft and only marks Invoices stale. A screen opened
 * afterwards reads the draft from the API (no fetch is cached,
 * `lib/api/http.ts`); one brought back by the browser's Back can show it
 * as it was until it is read again.
 */
export async function updateInvoice(
    id: string,
    input: InvoiceInput,
    orgId?: string,
) {
    return save(orgId, () => api.updateInvoice(id, input));
}

export async function deleteInvoice(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.deleteInvoice(id),
        () => refresh(),
    );
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
    orgId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    return save(
        orgId,
        () => setLineRates(id, rates),
        () => refresh(id),
    );
}

async function setLineRates(
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
    return { ok: true };
}

export async function issueInvoice(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.issueInvoice(id),
        () => refresh(id),
    );
}

export async function voidInvoice(id: string, reason: string, orgId?: string) {
    return save(
        orgId,
        () => api.voidInvoice(id, reason),
        () => refresh(id),
    );
}

export async function creditInvoice(
    id: string,
    reason: string,
    expect?: CreditExpect,
    orgId?: string,
) {
    return save(
        orgId,
        () => api.creditInvoice(id, reason, expect),
        () => refresh(id),
    );
}

export async function reissueInvoice(
    id: string,
    reason: string,
    orgId?: string,
) {
    return save(
        orgId,
        () => api.reissueInvoice(id, reason),
        () => refresh(id),
    );
}

/** The sheet's preview of the credit note: a read, nothing revalidated. */
export async function readCreditPreview(id: string) {
    return api.readCreditPreview(id);
}

/** Cancel and write a correct one: the invoice, its credit note and the draft. */
export async function creditAndRewriteInvoice(
    id: string,
    reason: string,
    expect?: CreditExpect,
    orgId?: string,
) {
    return save(
        orgId,
        () => api.creditAndRewriteInvoice(id, reason, expect),
        () => refresh(id),
    );
}

/** Write a void invoice again: a draft with its lines. */
export async function writeInvoiceAgain(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.writeInvoiceAgain(id),
        () => refresh(id),
    );
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
export async function recordPayment(
    id: string,
    input: PaymentInput,
    orgId?: string,
) {
    return save(
        orgId,
        () => api.recordPayment(id, input),
        () => refreshMoney(id),
    );
}

/** Remove a payment recorded by mistake (DEC-173); kept in the history. */
export async function removePayment(
    id: string,
    paymentId: string,
    reason?: string,
    orgId?: string,
) {
    return save(
        orgId,
        () => api.removePayment(id, paymentId, reason),
        () => refreshMoney(id),
    );
}

/** A waiting cheque is in the bank. */
export async function chequeCleared(
    id: string,
    paymentId: string,
    clearedAt?: string,
    orgId?: string,
) {
    return save(
        orgId,
        () => api.chequeCleared(id, paymentId, clearedAt),
        () => refreshMoney(id),
    );
}

/** A waiting cheque bounced: what it paid is owed again. */
export async function chequeBounced(
    id: string,
    paymentId: string,
    input: { bouncedAt?: string; reason?: string } = {},
    orgId?: string,
) {
    return save(
        orgId,
        () => api.chequeBounced(id, paymentId, input),
        () => refreshMoney(id),
    );
}

/** Share it by hand: WhatsApp, a link, the PDF, print, or a receipt by email. */
export async function shareInvoice(id: string, ask: ShareAsk, orgId?: string) {
    return save(
        orgId,
        () => api.shareInvoice(id, ask),
        () => refresh(id),
    );
}

export async function createPayLink(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.createPayLink(id),
        () => refresh(id),
    );
}

export async function createViewLink(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.createViewLink(id),
        () => refresh(id),
    );
}

export async function sendInvoice(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.sendInvoice(id),
        () => refresh(id),
    );
}

export async function remindInvoice(id: string, orgId?: string) {
    return save(
        orgId,
        () => api.remindInvoice(id),
        () => refresh(id),
    );
}

/** Remind all's list (Home plan U8): a read, through an action for the sheet. */
export async function previewReminders(ask: ReminderAsk) {
    return api.previewReminders(ask);
}

/** Remind all: Home and the invoices read again, with the reminders sent. */
export async function sendReminders(ask: ReminderAsk, orgId?: string) {
    return save(
        orgId,
        () => api.sendReminders(ask),
        () => {
            refresh();
            revalidate([["/"]]);
        },
    );
}
