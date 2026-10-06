import type { Prisma } from "@saroh/database";

import { planTakesInvoiceOnline } from "../billing/online-payments-plan";
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
 *
 * The plan has its say too (`billing/online-payments-plan.ts`): on a plan
 * without online payments the link is a view link, except on a renewal of
 * a subscription the business already has (pass the `invoice`), which
 * stays payable online.
 */
export async function invoicePayOnline(
    db: Pick<
        Prisma.TransactionClient,
        "organizationModule" | "merchantPaymentProvider"
    >,
    organizationId: string,
    invoice?: { subscriptionId?: string | null } | null,
): Promise<boolean> {
    const [on, provider, plan] = await Promise.all([
        paymentsOn(db, organizationId),
        db.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            select: { id: true },
        }),
        planTakesInvoiceOnline(organizationId, invoice),
    ]);
    return on && provider != null && plan;
}

/** What the pay page's payment routes answer when {@link invoicePayOnline} is false. */
export const NOT_PAID_ONLINE = "This business doesn't take payment online.";
