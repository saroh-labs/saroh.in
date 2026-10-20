import { prisma } from "@saroh/database";

/**
 * A paid invoice as the ledger keeps one (DEC-173): a spec that writes an
 * invoice straight to the database as PAID gives it the one payment every
 * path that pays an invoice writes (and the backfill wrote for those paid
 * before the ledger), for its total, received when it was paid, with its
 * `paidCents`. Money in (`invoices/money-in.ts`) counts the ledger, so a
 * PAID invoice with no payment would count nothing, as it never could in
 * the app.
 *
 * Nothing for an order's paper (the order is its ledger), a credit note, or
 * anything not paid.
 */
export async function onTheLedger<
    T extends {
        id: string;
        organizationId: string;
        status: string;
        kind: string;
        orderId: string | null;
        currency: string;
        total: { toString(): string };
        paidAt: Date | null;
    },
>(invoice: T): Promise<T> {
    if (
        invoice.status !== "PAID" ||
        invoice.orderId !== null ||
        invoice.kind === "CREDIT_NOTE" ||
        invoice.paidAt === null
    ) {
        return invoice;
    }
    const cents = Math.round(Number(invoice.total.toString()) * 100);
    if (cents <= 0) return invoice;
    await prisma.invoicePayment.create({
        data: {
            organizationId: invoice.organizationId,
            invoiceId: invoice.id,
            amountCents: cents,
            currency: invoice.currency,
            method: "CASH",
            receivedAt: invoice.paidAt,
        },
    });
    await prisma.invoice.update({
        where: { id: invoice.id },
        data: { paidCents: cents },
    });
    return invoice;
}
