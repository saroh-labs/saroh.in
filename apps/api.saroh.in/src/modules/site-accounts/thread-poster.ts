import { Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type {
    AccountThreadPost,
    AccountThreadPoster,
} from "../communications/account-thread";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { formatDay, formatMoney } from "../invoices/invoice-send.service";
import { isPastDue } from "../invoices/invoice-state";
import { appendMessage } from "./thread-store";

/** Home's default zone, for a business that never set one (as D17). */
const DEFAULT_ZONE = "Asia/Kolkata";

/**
 * Saroh's post into a customer's account thread (round-2 A13, for D17's
 * {@link AccountThreadPoster} port): an invoice sent, or a reminder about
 * it, as a SYSTEM message from the business.
 *
 * The message is written on the caller's transaction, under the invoice's
 * lock, and carries the invoice and what happened (`invoiceId`, `event`),
 * so D17's once-sent and one-reminder-a-day rules count it beside the
 * invoice's emails even when the thread is the only channel.
 *
 * It never carries the pay link: a link's token is stored nowhere in the
 * clear (D17), and a thread message is kept. The sentence names the
 * invoice, its amount and when it is due.
 *
 * Only reached while the `ACCOUNT_THREAD` flag is on (off by default) and
 * the contact has a live site account (`InvoiceSendService.threadOpen`).
 */
@Injectable()
export class AccountThreadPosterService implements AccountThreadPoster {
    async post(
        tx: Prisma.TransactionClient,
        input: AccountThreadPost,
    ): Promise<void> {
        const now = new Date();
        const [invoice, profile, contact] = await Promise.all([
            tx.invoice.findFirst({
                where: {
                    id: input.invoiceId,
                    organizationId: input.organizationId,
                },
                select: {
                    number: true,
                    total: true,
                    currency: true,
                    dueAt: true,
                    status: true,
                },
            }),
            tx.businessProfile.findUnique({
                where: { organizationId: input.organizationId },
                select: { timezone: true },
            }),
            // Named by the invoice: a merge since lands it on the survivor.
            resolveContact(tx, input.contactId, input.organizationId),
        ]);
        if (!invoice || !contact || contact.removed) return;
        await appendMessage(tx, {
            organizationId: input.organizationId,
            contactId: contact.id,
            author: "SYSTEM",
            body: invoiceSentence(
                input.kind,
                invoice,
                profile?.timezone ?? DEFAULT_ZONE,
                now,
            ),
            authorUserId: input.actorUserId,
            event: input.kind,
            invoiceId: input.invoiceId,
            now,
        });
    }
}

/**
 * "Invoice RC-0012 for ₹2,400.00 is ready to pay. It's due by 3 Oct 2026."
 * A reminder says so, and an overdue one says when it was due.
 */
export function invoiceSentence(
    kind: AccountThreadPost["kind"],
    invoice: {
        number: string | null;
        total: { toString(): string };
        currency: string;
        dueAt: Date | null;
        status: string;
    },
    timeZone: string,
    now: Date,
): string {
    const what = `invoice ${invoice.number ?? ""}`.trim();
    const amount = formatMoney(invoice.total, invoice.currency);
    const overdue = isPastDue(invoice, now);
    const due = invoice.dueAt
        ? overdue
            ? ` It was due on ${formatDay(invoice.dueAt, timeZone)}.`
            : ` It's due by ${formatDay(invoice.dueAt, timeZone)}.`
        : "";
    const first =
        kind === "INVOICE_REMINDER"
            ? `A reminder: ${what} for ${amount} is still to pay.`
            : `${what.charAt(0).toUpperCase()}${what.slice(1)} for ${amount} is ready to pay.`;
    return `${first}${due}`;
}
