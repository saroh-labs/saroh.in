import type { Prisma } from "@saroh/database";

import {
    noProviderReason,
    planTakesInvoiceOnline,
} from "../billing/online-payments-plan";
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
    return (await invoiceOnlineBlocker(db, organizationId, invoice)) === null;
}

/**
 * Why this invoice can't be paid online, or null when it can (#835): the
 * plan first — on a plan without online payments, Payments and a provider
 * can't change it, so the merchant is pointed at the plan, not at
 * connecting one — then Payments switched off, then no provider whose
 * checkout can open. The booking side's `onlinePaymentBlocker`
 * (`bookings/booking-payment.ts`) asks the same, minus the renewal.
 */
export async function invoiceOnlineBlocker(
    db: Pick<
        Prisma.TransactionClient,
        "organizationModule" | "merchantPaymentProvider"
    >,
    organizationId: string,
    invoice?: { subscriptionId?: string | null } | null,
): Promise<InvoiceOnlineBlocker | null> {
    const [on, provider, plan] = await Promise.all([
        paymentsOn(db, organizationId),
        db.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            select: { id: true },
        }),
        planTakesInvoiceOnline(organizationId, invoice),
    ]);
    if (!plan) return "PLAN";
    if (!on) return "PAYMENTS_OFF";
    // None connected, and the plan may not let one be (UX-017).
    return provider == null ? noProviderReason(organizationId) : null;
}

/** The booking side's `OnlineBlocker`, by the same names. */
export type InvoiceOnlineBlocker = "PLAN" | "PAYMENTS_OFF" | "NO_PROVIDER";

/** What the pay page's payment routes answer when {@link invoicePayOnline} is false. */
export const NOT_PAID_ONLINE = "This business doesn't take payment online.";
