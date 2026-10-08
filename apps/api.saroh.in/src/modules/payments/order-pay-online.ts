import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { planTakesOnlinePayment } from "../billing/online-payments-plan";
import { paymentsOn } from "../invoices/payments-on";
import { payLinkProvider } from "./pay-link-provider";

/**
 * Whether an order's pay link can still take the money online — what the
 * customer's order pay page reads as `payOnline` (R33, 6 Oct 2026), beside
 * `invoicePayOnline` for invoices: the plan takes online payment
 * (`planTakesOnlinePayment`), Payments is on, and the order's storefront
 * has a provider that opens the checkout window (`payLinkProvider`, the
 * rule the payment route itself takes).
 *
 * A link made before a downgrade (or before Payments went off, or its
 * provider was disconnected) still opens, but view-only: the order and
 * what is due, and "Pay {business} directly". Starting a payment is
 * refused by the route on its own.
 */
export async function orderPayOnline(
    db: Pick<
        Prisma.TransactionClient,
        "organizationModule" | "merchantPaymentProvider" | "storeSettings"
    >,
    organizationId: string,
    storeId: string,
): Promise<boolean> {
    const [plan, on, provider] = await Promise.all([
        planTakesOnlinePayment(organizationId),
        paymentsOn(db, organizationId),
        payLinkProvider(db, organizationId, storeId).then(
            () => true,
            (err: unknown) => {
                // No provider that can take it: a view link, not a failure.
                if (err instanceof ConflictException) return false;
                throw err;
            },
        ),
    ]);
    return plan && on && provider;
}
