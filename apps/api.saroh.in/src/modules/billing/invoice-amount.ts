import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { raiseBillingActionInTx } from "./billing-actions";
import { providerName, rupees } from "./double-charge";

type Tx = Pick<Prisma.TransactionClient, "sarohInvoice" | "billingAction">;

/**
 * What the provider says it took for an invoice, kept on it
 * (`SarohInvoice.providerAmountPaise`, DEC-166) and checked against the
 * invoice's own total. Saroh writes the invoice from its own numbers (the
 * plan's price, a coupon's months, the add-ons it sent), so a coupon the
 * provider didn't apply, or an add-on it charged later, would leave a tax
 * invoice for an amount nobody paid; that is an ERROR log and a
 * Needs-action row, once per invoice. Called when the invoice is written,
 * when a later event names its payment, and by the daily reconcile.
 *
 * Never overwrites an amount already kept; a zero or missing amount says
 * nothing. Returns whether the amounts differ.
 */
export async function keepProviderAmountInTx(
    tx: Tx,
    logger: Pick<Logger, "error">,
    invoice: {
        id: string;
        organizationId: string;
        number: string;
        provider: string;
        providerPaymentId: string | null;
        totalPaise: number;
        providerAmountPaise: number | null;
    },
    amountPaise: number | null | undefined,
): Promise<boolean> {
    if (typeof amountPaise !== "number" || amountPaise <= 0) return false;
    if (invoice.providerAmountPaise === null) {
        await tx.sarohInvoice.update({
            where: { id: invoice.id },
            data: { providerAmountPaise: amountPaise },
        });
    }
    const kept = invoice.providerAmountPaise ?? amountPaise;
    if (kept === invoice.totalPaise) return false;
    const where = providerName(invoice.provider);
    logger.error(
        `saroh_invoice_amount_mismatch org=${invoice.organizationId} invoice=${invoice.number} total=${invoice.totalPaise} provider=${kept} payment=${invoice.providerPaymentId ?? "none"}`,
    );
    await raiseBillingActionInTx(tx, {
        organizationId: invoice.organizationId,
        code: "saroh_invoice_amount_mismatch",
        refs: {
            provider: invoice.provider,
            invoice: invoice.number,
            payment: invoice.providerPaymentId,
        },
        note: `Saroh invoice ${invoice.number} is for ${rupees(invoice.totalPaise)}, but ${where} took ${rupees(kept)} for payment ${invoice.providerPaymentId ?? "(none named)"}. Check the payment in ${where} and ask the CA whether the invoice needs a credit note or a fresh one.`,
        dedupeKey: `amount-mismatch:${invoice.id}`,
    });
    return true;
}
