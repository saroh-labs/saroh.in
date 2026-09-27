import type { PayingLinkOutcome, Prisma } from "@saroh/database";
import { linkPayingCustomer } from "@saroh/database";

import { normaliseEmail } from "./duplicates";

/**
 * A contact for the customer who just paid (DEC-041, C2).
 *
 * Runs in the transaction that makes the order's invoice
 * (`invoices/order-invoicing.ts` `ensureOrderInvoice`, under the order's row
 * lock), so the link lands or rolls back with the payment and needs no lock
 * of its own. The rule is `linkPayingCustomer` in `@saroh/database`, the one
 * the backfill runs: a store customer with no link gets a new contact and a
 * PAYMENT link with no team member on it; one whose email a contact or a
 * site account already holds is left for staff to link or merge, never
 * linked silently (#120). Emails are read through `duplicates.ts`, so a
 * reserved placeholder is no email.
 *
 * Skipped, with nothing written:
 * - an order that isn't paid;
 * - a walk-in: no store customer (B13 makes `Order.customerId` nullable) or
 *   one with no email (default 19) — there is nobody to make a contact for;
 * - an order with no business (from before ADR-001).
 */
export async function ensureContactForPaidOrder(
    tx: Prisma.TransactionClient,
    order: {
        organizationId: string | null;
        customerId: string | null;
        paymentStatus: string;
    },
): Promise<PayingLinkOutcome | null> {
    if (order.paymentStatus !== "PAID") return null;
    if (!order.organizationId || !order.customerId) return null;
    return linkPayingCustomer(
        tx,
        {
            organizationId: order.organizationId,
            customerId: order.customerId,
            reason: "PAYMENT",
        },
        normaliseEmail,
    );
}
