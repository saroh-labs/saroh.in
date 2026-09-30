import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * One charge at a time per invoice (round-2 D13, DEC-038). While an
 * autopay charge is under way on an invoice, nothing else may take money
 * for it: a pay-link intent is refused (409 "Autopay charge in progress"),
 * and "Pay now" (A8), Send and Send reminder (D17, F4) and Retry by link
 * are hidden. UPI Autopay waits a day or more on its pre-debit notice, so
 * without this a customer could pay by link and then be debited too.
 *
 * A leaf, so the invoices, subscriptions and payments modules can all ask
 * without importing each other's services.
 */

/** What the customer and the team are told while a charge is under way. */
export const AUTOPAY_CHARGE_IN_PROGRESS = "Autopay charge in progress";

/** A mandate charge's intent that is still open. */
export const OPEN_MANDATE_CHARGE = [
    "CREATED",
    "REQUIRES_PAYMENT",
    "PROCESSING",
];

/** An autopay charge under way on one invoice. */
export interface ChargeUnderWay {
    intentId: string;
    /** When the debit is (or was) asked for: its `debitAfter`, else when it began. */
    at: Date;
}

type Db = Pick<Prisma.TransactionClient, "paymentIntent">;

/**
 * The open mandate charges on these invoices, by invoice. A charge counts
 * while its debit has been asked for (PROCESSING: money may move), or its
 * mandate is still ACTIVE. One whose mandate was cancelled or paused since
 * is never debited — `MandateChargesService.charge` refuses it — so it no
 * longer blocks the pay link.
 */
export async function chargesUnderWay(
    db: Db,
    organizationId: string,
    invoiceIds: readonly string[],
): Promise<Map<string, ChargeUnderWay>> {
    const byInvoice = new Map<string, ChargeUnderWay>();
    if (invoiceIds.length === 0) return byInvoice;
    const rows = await db.paymentIntent.findMany({
        where: {
            organizationId,
            invoiceId: { in: [...invoiceIds] },
            viaMandateId: { not: null },
            // A sale's charge only: never D12B's ₹1 autopay check.
            purpose: null,
            status: { in: OPEN_MANDATE_CHARGE },
            OR: [
                { status: "PROCESSING" },
                { viaMandate: { is: { status: "ACTIVE" } } },
            ],
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            invoiceId: true,
            debitAfter: true,
            createdAt: true,
        },
    });
    for (const row of rows) {
        if (!row.invoiceId || byInvoice.has(row.invoiceId)) continue;
        byInvoice.set(row.invoiceId, {
            intentId: row.id,
            at: row.debitAfter ?? row.createdAt,
        });
    }
    return byInvoice;
}

/** The open mandate charge on one invoice, or null. */
export async function chargeUnderWayOn(
    db: Db,
    organizationId: string,
    invoiceId: string,
): Promise<ChargeUnderWay | null> {
    const found = await chargesUnderWay(db, organizationId, [invoiceId]);
    return found.get(invoiceId) ?? null;
}

/**
 * The charge under way on any unpaid invoice of these subscriptions, by
 * subscription: what the account, Subscription Detail and Home say as
 * "Autopay charge in progress · ‹date›".
 */
export async function subscriptionChargesUnderWay(
    db: Pick<Prisma.TransactionClient, "paymentIntent" | "invoice">,
    organizationId: string,
    subscriptionIds: readonly string[],
): Promise<Map<string, ChargeUnderWay & { invoiceId: string }>> {
    const bySubscription = new Map<
        string,
        ChargeUnderWay & { invoiceId: string }
    >();
    if (subscriptionIds.length === 0) return bySubscription;
    const unpaid = await db.invoice.findMany({
        where: {
            organizationId,
            subscriptionId: { in: [...subscriptionIds] },
            status: "ISSUED",
            paymentIntents: {
                some: {
                    viaMandateId: { not: null },
                    purpose: null,
                    status: { in: OPEN_MANDATE_CHARGE },
                },
            },
        },
        select: { id: true, subscriptionId: true },
    });
    const charges = await chargesUnderWay(
        db,
        organizationId,
        unpaid.map((i) => i.id),
    );
    for (const inv of unpaid) {
        const charge = charges.get(inv.id);
        if (!charge || !inv.subscriptionId) continue;
        const had = bySubscription.get(inv.subscriptionId);
        if (!had || charge.at < had.at) {
            bySubscription.set(inv.subscriptionId, {
                ...charge,
                invoiceId: inv.id,
            });
        }
    }
    return bySubscription;
}

/**
 * The other half of "one charge at a time": a pay-link checkout the
 * customer has open on the invoice. A sale's intent that isn't autopay's
 * (no mandate, no `purpose`, so never D12B's ₹1 check), still open. Retiring
 * the link wouldn't stop it: the checkout already holds its provider order,
 * and the customer can finish it. So while one is open, autopay neither
 * queues, prepares nor debits a charge on the invoice.
 *
 * A checkout the customer walked away from stays open, and keeps autopay
 * off this invoice; the pay link, as before autopay, is the way to be paid.
 */
export const OPEN_CHECKOUT_WHERE = {
    viaMandateId: null,
    purpose: null,
    status: { in: OPEN_MANDATE_CHARGE },
} satisfies Prisma.PaymentIntentWhereInput;

/** Whether a pay-link checkout is open on the invoice (above). */
export async function checkoutOpenOn(
    db: Db,
    organizationId: string,
    invoiceId: string,
): Promise<boolean> {
    const open = await db.paymentIntent.findFirst({
        where: { organizationId, invoiceId, ...OPEN_CHECKOUT_WHERE },
        select: { id: true },
    });
    return open !== null;
}

/** The 409 every other way to pay answers while a charge is under way. */
export function autopayChargeInProgress(): ConflictException {
    return new ConflictException({
        message: AUTOPAY_CHARGE_IN_PROGRESS,
        details: { reason: "autopay-pending" },
    });
}
