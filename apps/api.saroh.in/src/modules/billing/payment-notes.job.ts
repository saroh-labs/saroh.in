import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { BillingProviderFactory } from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

/**
 * Saroh's ids on the provider's payment (owner, 17 Oct 2026: "make sure the
 * info passed to razorpay properly and mapped in our app too … so that we
 * can track payments easily"): once Saroh's invoice for a payment is
 * written, the payment's notes get the invoice number, the business and the
 * checkout, so the Razorpay dashboard leads back to Saroh.
 *
 * Queued on the invoice's transaction (the outbox) and never in its way: a
 * provider that is down is retried by the queue; a refusal, or the last
 * try, is logged (`billing_payment_notes_failed`) and dropped.
 */
export const BILLING_PAYMENT_NOTES_TYPE = "billing.payment.notes";

export interface PaymentNotesPayload {
    invoiceId: string;
}

export async function enqueuePaymentNotes(
    tx: Pick<Prisma.TransactionClient, "job">,
    input: { organizationId: string; invoiceId: string },
): Promise<void> {
    await tx.job.create({
        data: {
            type: BILLING_PAYMENT_NOTES_TYPE,
            organizationId: input.organizationId,
            payload: { invoiceId: input.invoiceId },
        },
    });
}

@Injectable()
export class PaymentNotesHandler {
    private readonly logger = new Logger(PaymentNotesHandler.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = job.payload as Partial<PaymentNotesPayload> | null;
        const invoice = p?.invoiceId
            ? await prisma.sarohInvoice.findUnique({
                  where: { id: p.invoiceId },
                  select: {
                      number: true,
                      organizationId: true,
                      provider: true,
                      providerPaymentId: true,
                      checkoutId: true,
                  },
              })
            : null;
        if (!invoice?.providerPaymentId) {
            this.logger.warn(`billing_payment_notes_skipped job=${job.id}`);
            return;
        }
        const notes = this.providers.get(invoice.provider).paymentNotes;
        if (!notes) return;
        try {
            await notes.setPaymentNotes({
                providerPaymentId: invoice.providerPaymentId,
                notes: {
                    saroh_invoice: invoice.number,
                    organizationId: invoice.organizationId,
                    ...(invoice.checkoutId
                        ? { saroh_checkout: invoice.checkoutId }
                        : {}),
                },
            });
        } catch (error) {
            const refused =
                error instanceof BillingProviderError &&
                error.kind === "REFUSED";
            const last = refused || job.attempts + 1 >= job.maxAttempts;
            this.logger.error(
                `billing_payment_notes_failed org=${invoice.organizationId} payment=${invoice.providerPaymentId} invoice=${invoice.number} attempt=${job.attempts + 1}/${job.maxAttempts}: ${
                    error instanceof Error ? error.message : "unknown error"
                }`,
            );
            if (last) return;
            throw error;
        }
    };
}
