import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { raiseBillingActionInTx } from "./billing-actions";
import { providerName, rupees } from "./double-charge";

type Tx = Pick<
    Prisma.TransactionClient,
    "sarohInvoice" | "billingAction" | "billingCheckout"
>;

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
 * An invoice with a coupon's discount that differs most likely means the
 * coupon's Razorpay Offer takes off another amount than the coupon (review
 * 18 Nov 2026, F7: Razorpay has no API to read an Offer back, so this is
 * the first moment Saroh can tell): a second row, once per coupon and
 * Offer, so the team fixes the Offer or pauses the coupon before more
 * businesses are charged one amount and invoiced another.
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
        /** For F7's coupon check: the charge's subscription and discount. */
        providerSubscriptionId?: string | null;
        discountPaise?: number;
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
    if ((invoice.discountPaise ?? 0) > 0 && invoice.providerSubscriptionId) {
        await couponOfferMismatchInTx(tx, logger, {
            ...invoice,
            providerSubscriptionId: invoice.providerSubscriptionId,
            kept,
        });
    }
    return true;
}

/** F7: the coupon behind a discounted invoice that didn't match, raised once. */
async function couponOfferMismatchInTx(
    tx: Tx,
    logger: Pick<Logger, "error">,
    invoice: {
        organizationId: string;
        number: string;
        provider: string;
        providerSubscriptionId: string;
        totalPaise: number;
        kept: number;
    },
): Promise<void> {
    const checkout = await tx.billingCheckout.findUnique({
        where: {
            provider_providerSubscriptionId: {
                provider: invoice.provider,
                providerSubscriptionId: invoice.providerSubscriptionId,
            },
        },
        select: {
            coupon: { select: { id: true, code: true, razorpayOfferId: true } },
        },
    });
    const coupon = checkout?.coupon;
    if (!coupon) return;
    logger.error(
        `billing_coupon_offer_mismatch coupon=${coupon.code} offer=${coupon.razorpayOfferId ?? "none"} invoice=${invoice.number}`,
    );
    await raiseBillingActionInTx(tx, {
        organizationId: null,
        code: "billing_coupon_offer_mismatch",
        refs: {
            coupon: coupon.code,
            offer: coupon.razorpayOfferId,
            invoice: invoice.number,
        },
        note: `Coupon ${coupon.code}'s discounted charge was ${rupees(invoice.kept)} where Saroh invoiced ${rupees(invoice.totalPaise)} (invoice ${invoice.number}), so its Razorpay Offer takes off a different amount. Pause the coupon in Plans › Offers, then set the Offer to the flat amount the quote shows (PRICING_ROLLOUT.md, Coupons on Razorpay) or paste a new Offer's ID. Later invoices with it may differ too.`,
        dedupeKey: `coupon-offer-mismatch:${coupon.id}:${coupon.razorpayOfferId ?? "none"}`,
    });
}
