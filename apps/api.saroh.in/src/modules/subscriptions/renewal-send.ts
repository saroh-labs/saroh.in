import type { Prisma } from "@saroh/database";

import { enqueueRenewalSendInTx } from "../invoices/invoice-auto-send";
import type { QueueChargeResult } from "../payments/mandate-charges.service";

/**
 * A renewal's invoice is sent without anyone pressing Send (automatic
 * notices U10, DEC-174 R3), unless autopay is taking it:
 *
 * - **QUEUED:** live autopay will charge it. It isn't sent as a request to
 *   pay; the receipt (DEC-173) tells the customer once it is charged, and
 *   a failed charge tells them with a link to pay (`autopay-failed`).
 * - **CHECKOUT_OPEN:** the customer is already paying it by link; a send
 *   would mint a new link under them (DEC-110).
 * - **NONE, LIMIT_LOW, or no autopay at all:** queued `invoice.auto-send`,
 *   on the renewal's transaction, when the business's "Renewal invoices"
 *   switch is on. Returns whether it was queued.
 */
export async function sendRenewalUnlessCharged(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoiceId: string,
    input: { charge: QueueChargeResult | undefined; now: Date },
): Promise<boolean> {
    const status = input.charge?.status;
    if (status === "QUEUED" || status === "CHECKOUT_OPEN") return false;
    return enqueueRenewalSendInTx(tx, {
        organizationId,
        invoiceId,
        runAt: input.now,
    });
}
