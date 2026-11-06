import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { STRIPE_MINIMUM_CENTS } from "./providers/stripe-payments";

/**
 * Stripe's least charge in one payment (DEC-208). A price or deposit a
 * business sets is refused under it while the business takes payment
 * through Stripe, and the intent refuses it again as the last guard
 * (`PaymentsService`). Razorpay and Cashfree are never asked.
 */

/**
 * Why Stripe can't take `amountCents` of `currency` in one payment, or
 * null when it can: nothing to charge, a currency with no known minimum,
 * or an amount at or above it.
 */
export function belowStripeMinimum(
    amountCents: number,
    currency: string,
): string | null {
    if (amountCents <= 0) return null;
    const code = currency.trim().toUpperCase();
    if (!(code in STRIPE_MINIMUM_CENTS)) return null;
    const minimum = STRIPE_MINIMUM_CENTS[code];
    if (amountCents >= minimum) return null;
    const amount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
    }).format(minimum / 100);
    return `Stripe can't take less than ${amount} in one payment.`;
}

/**
 * Refuse (400, under `field`) a price or deposit Stripe couldn't take,
 * when the business takes payment online through Stripe. A charge with no
 * amount or currency yet asks nothing; the connection is read only when
 * the amount is under a minimum.
 */
export async function assertStripeTakes(
    db: Pick<Prisma.TransactionClient, "merchantPaymentProvider">,
    organizationId: string,
    charge: { amountCents: number | null; currency: string | null },
    field: string,
): Promise<void> {
    if (charge.amountCents === null || !charge.currency) return;
    const message = belowStripeMinimum(charge.amountCents, charge.currency);
    if (!message) return;
    const viaStripe = await db.merchantPaymentProvider.count({
        where: { organizationId, provider: "STRIPE", status: "CONNECTED" },
    });
    if (viaStripe === 0) return;
    throw new BadRequestException({ message, details: { field } });
}
