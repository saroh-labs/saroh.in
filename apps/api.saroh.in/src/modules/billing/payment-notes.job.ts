import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { raiseBillingOpsNoticeInTx } from "./billing-ops-notice";
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
 * provider that is down is retried by the queue (`PAYMENT_NOTES_MAX_ATTEMPTS`,
 * about 20 minutes); a refusal, or the last try, is logged
 * (`billing_payment_notes_failed`) and left as a note on the business in
 * the admin console, so the payment can be tagged by hand.
 */
export const BILLING_PAYMENT_NOTES_TYPE = "billing.payment.notes";

/** Tries before the queue gives up (1 s doubling, 5 min cap). */
export const PAYMENT_NOTES_MAX_ATTEMPTS = 10;

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
            maxAttempts: PAYMENT_NOTES_MAX_ATTEMPTS,
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
            if (!last) throw error;
            await prisma.$transaction((tx) =>
                raiseBillingOpsNoticeInTx(tx, this.logger, {
                    code: "billing_payment_notes_given_up",
                    organizationId: invoice.organizationId,
                    refs: {
                        provider: invoice.provider,
                        payment: invoice.providerPaymentId,
                        invoice: invoice.number,
                    },
                    note: `Saroh couldn't add its invoice number to payment ${invoice.providerPaymentId} at the billing provider${refused ? " (refused)" : ` after ${job.attempts + 1} tries`}. The payment and invoice ${invoice.number} are fine; add the note saroh_invoice=${invoice.number} in the provider's dashboard if you need to match them there.`,
                }),
            );
        }
    };
}
