import type { Prisma } from "@saroh/database";

import { changeOfHeld, readJoinAutopay } from "../payments/join-autopay";
import { applyMandateChangeInTx } from "../payments/mandate-events";

/**
 * A plan joined with autopay (round-2 D12 on G20's pay-first join): once
 * the join's payment has started the subscription, its mandate row is made
 * under the id the provider already knows, PENDING, and any report the
 * provider sent while the draft waited is applied now. Only when the
 * payment that landed is the authorisation's own (UPI, card: the first
 * period is the authorisation payment); a plain payment on the same draft
 * joins without autopay, and the customer can set it up from their account.
 *
 * Runs in the webhook's transaction, under the invoice's lock, after the
 * subscription is made.
 */
export async function startJoinMandateInTx(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        subscriptionId: string;
        contactId: string;
        accountId: string;
        planTerms: Prisma.JsonValue | null;
        /** The provider order the join was paid on. */
        providerIntentId: string | null | undefined;
    },
): Promise<{ mandateId: string } | null> {
    const autopay = readJoinAutopay(input.planTerms);
    if (!autopay || autopay.setupReference !== input.providerIntentId) {
        return null;
    }
    const { organizationId } = input;
    await tx.paymentMandate.create({
        data: {
            id: autopay.mandateId,
            organizationId,
            contactId: input.contactId,
            subscriptionId: input.subscriptionId,
            provider: autopay.provider,
            providerCustomerId: autopay.providerCustomerId,
            status: "PENDING",
            method: autopay.method,
            maxAmountCents: autopay.maxAmountCents,
            currency: autopay.currency,
            frequency: autopay.frequency,
            setupReference: autopay.setupReference,
            setupExpiresAt: new Date(autopay.setupExpiresAt),
            expiresAt: new Date(autopay.expiresAt),
            setupSource: "PRICES",
            setupAccountId: input.accountId,
        },
    });
    if (autopay.reported) {
        await applyMandateChangeInTx(
            tx,
            organizationId,
            autopay.provider,
            changeOfHeld(autopay.reported, autopay.setupReference),
        );
    }
    return { mandateId: autopay.mandateId };
}
