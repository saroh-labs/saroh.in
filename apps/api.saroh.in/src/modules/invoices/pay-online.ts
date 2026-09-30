import type { Prisma } from "@saroh/database";

import { OPENS_CHECKOUT } from "../payments/public-key";
import { paymentsOn } from "./payments-on";

/**
 * Whether an invoice of this business can be paid online (DEC-070): Payments
 * is on, and a connected provider can open the checkout window — the
 * `businessPayLinkProvider` rule, asked without throwing. A Razorpay
 * connection still missing its public key id counts as none (DEC-054).
 *
 * Invoicing itself doesn't need it: an invoice is issued, sent and recorded
 * paid without Payments. It decides only whether the link a customer gets
 * offers "Pay online" (`payOnline` on the send view and the pay page), or
 * just shows the invoice.
 */
export async function invoicePayOnline(
    db: Pick<
        Prisma.TransactionClient,
        "organizationModule" | "merchantPaymentProvider"
    >,
    organizationId: string,
): Promise<boolean> {
    const [on, provider] = await Promise.all([
        paymentsOn(db, organizationId),
        db.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            select: { id: true },
        }),
    ]);
    return on && provider !== null;
}

/** What the pay page's payment routes answer when {@link invoicePayOnline} is false. */
export const NOT_PAID_ONLINE = "This business doesn't take payment online.";
