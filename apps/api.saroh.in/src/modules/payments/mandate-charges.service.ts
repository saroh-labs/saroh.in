import { Inject, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import type { MandateConnection } from "./mandate-connection";
import { openMandateConnection } from "./mandate-connection";
import type {
    PreDebitStatus,
    ProviderFactory,
} from "./providers/provider.port";
import {
    isMandateMethod,
    MandateCallError,
    PRE_DEBIT_LEAD_HOURS,
    PROVIDER_FACTORY,
} from "./providers/provider.port";

/**
 * Charging an autopay mandate (round-2 D11; D13's renewal job calls it).
 *
 * A charge is two steps, as the D11 spike found Razorpay's UPI Autopay to
 * be: {@link prepareCharge} makes the provider's order with a pre-debit
 * notice (the provider sends it to the customer), and {@link charge} asks
 * for the debit only once that notice is delivered and `debitAfter` has
 * passed — before then the provider refuses with
 * `pre_debit_notification_not_sent`. A method that needs no notice
 * (`NOT_NEEDED`) may be charged at once.
 *
 * The intent is the charge's record: `viaMandateId`, `debitAfter` and the
 * notice's state on the invoice's PaymentIntent, under Saroh's charge key
 * (`inv_<invoiceId>_<attempt>`, D13). Its payment settles through the
 * webhook exactly as a pay link's does.
 *
 * Nothing here charges a mandate that isn't ACTIVE, an invoice from
 * another subscription, an invoice that isn't ISSUED, or more than the
 * mandate's limit. Errors are sanitised to an outcome; an unsure answer
 * never becomes "failed" or "done" (DEC-026).
 */

/** The earliest a debit can be asked for when the notice is sent `now`. */
export function earliestDebitAt(now: Date = new Date()): Date {
    return new Date(now.getTime() + PRE_DEBIT_LEAD_HOURS * 60 * 60 * 1000);
}

export type ChargeRefusal =
    /** The mandate isn't ACTIVE (cancelled, paused, failed, or not set up). */
    | "MANDATE_NOT_ACTIVE"
    /** The invoice belongs to another subscription than the mandate's. */
    | "OTHER_SUBSCRIPTION"
    /** The invoice isn't ISSUED (paid, void, draft) or not in its currency. */
    | "INVOICE_NOT_PAYABLE"
    /** The invoice is above the mandate's limit (D13: MANDATE_LIMIT_LOW). */
    | "ABOVE_LIMIT"
    /** Another autopay charge for this invoice is still open. */
    | "CHARGE_IN_PROGRESS"
    /** The provider can't be asked (no connection, or no autopay there). */
    | "NO_PROVIDER"
    /** The provider refused, and would again. */
    | "PROVIDER_REFUSED";

export type PrepareChargeResult =
    | {
          status: "PREPARED";
          intentId: string;
          providerIntentId: string;
          debitAfter: Date;
          preDebitStatus: PreDebitStatus;
      }
    | { status: "REFUSED"; reason: ChargeRefusal; intentId?: string }
    /** No answer: the intent waits (CREATED); asking again is safe. */
    | { status: "UNKNOWN"; intentId: string };

export type ChargeResult =
    /** The debit is asked for; the payment webhook settles it. */
    | {
          status: "CHARGING";
          intentId: string;
          providerPaymentRef: string | null;
      }
    /** Not yet: the notice isn't delivered, or `debitAfter` hasn't come. */
    | { status: "NOT_YET"; intentId: string; debitAfter: Date | null }
    | {
          status: "REFUSED";
          reason: ChargeRefusal | "NOTICE_FAILED";
          intentId: string;
      }
    | { status: "FAILED"; intentId: string }
    /** Already charging or settled: nothing was asked again. */
    | { status: "ALREADY"; intentId: string; intentStatus: string }
    /** No answer: the intent stays PROCESSING, to be looked up, never re-sent blind. */
    | { status: "UNKNOWN"; intentId: string };

export interface PrepareChargeInput {
    organizationId: string;
    mandateId: string;
    invoiceId: string;
    /** Saroh's charge key, e.g. `inv_<invoiceId>_<attempt>` (D13). */
    key: string;
    /** When the debit should happen; at least {@link earliestDebitAt}. */
    debitAt: Date;
}

const OPEN_CHARGE = ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"];

@Injectable()
export class MandateChargesService {
    private readonly logger = new Logger(MandateChargesService.name);

    constructor(
        @Inject(PROVIDER_FACTORY) private readonly providers: ProviderFactory,
    ) {}

    /**
     * Step one: check the mandate may take this invoice, write the intent,
     * and make the provider's order with its pre-debit notice. Safe to call
     * again with the same key: it answers with the intent already made, and
     * a waiting one asks the provider again under the same reference.
     */
    async prepareCharge(
        input: PrepareChargeInput,
    ): Promise<PrepareChargeResult> {
        const { organizationId, mandateId, invoiceId, key } = input;
        const mandate = await prisma.paymentMandate.findFirst({
            where: { id: mandateId, organizationId },
        });
        if (mandate?.status !== "ACTIVE" || !mandate.providerMandateId) {
            return { status: "REFUSED", reason: "MANDATE_NOT_ACTIVE" };
        }
        const invoice = await prisma.invoice.findFirst({
            where: { id: invoiceId, organizationId },
            select: {
                id: true,
                status: true,
                total: true,
                currency: true,
                subscriptionId: true,
            },
        });
        if (invoice?.subscriptionId !== mandate.subscriptionId) {
            return { status: "REFUSED", reason: "OTHER_SUBSCRIPTION" };
        }

        const made = await prisma.paymentIntent.findFirst({
            where: { organizationId, invoiceId, idempotencyKey: key },
        });
        if (made && made.viaMandateId !== mandate.id) {
            return { status: "REFUSED", reason: "CHARGE_IN_PROGRESS" };
        }
        if (made?.providerIntentId && made.debitAfter && made.preDebitStatus) {
            return {
                status: "PREPARED",
                intentId: made.id,
                providerIntentId: made.providerIntentId,
                debitAfter: made.debitAfter,
                preDebitStatus: made.preDebitStatus as PreDebitStatus,
            };
        }
        if (made && made.status !== "CREATED") {
            return {
                status: "REFUSED",
                reason: "PROVIDER_REFUSED",
                intentId: made.id,
            };
        }

        const amountCents = toMinor(invoice.total);
        if (
            invoice.status !== "ISSUED" ||
            invoice.currency !== mandate.currency ||
            amountCents <= 0
        ) {
            return { status: "REFUSED", reason: "INVOICE_NOT_PAYABLE" };
        }
        if (
            mandate.maxAmountCents === null ||
            amountCents > mandate.maxAmountCents
        ) {
            return { status: "REFUSED", reason: "ABOVE_LIMIT" };
        }
        if (!made) {
            const other = await prisma.paymentIntent.findFirst({
                where: {
                    organizationId,
                    invoiceId,
                    viaMandateId: { not: null },
                    status: { in: OPEN_CHARGE },
                },
                select: { id: true },
            });
            if (other) {
                return {
                    status: "REFUSED",
                    reason: "CHARGE_IN_PROGRESS",
                    intentId: other.id,
                };
            }
        }

        const connection = await this.connection(
            organizationId,
            mandate.provider,
        );
        if (!connection) return { status: "REFUSED", reason: "NO_PROVIDER" };

        const intent =
            made ??
            (await prisma.paymentIntent.create({
                data: {
                    organizationId,
                    invoiceId,
                    provider: mandate.provider,
                    amountCents,
                    currency: invoice.currency,
                    status: "CREATED",
                    idempotencyKey: key,
                    viaMandateId: mandate.id,
                    preDebitStatus: "PENDING",
                },
            }));

        try {
            const prepared = await connection.mandates.prepareCharge({
                reference: key,
                providerMandateId: mandate.providerMandateId,
                providerCustomerId: mandate.providerCustomerId,
                method: isMandateMethod(mandate.method) ? mandate.method : null,
                amountCents: intent.amountCents,
                currency: intent.currency,
                debitAt: input.debitAt,
                credentials: connection.credentials,
            });
            await prisma.paymentIntent.update({
                where: { id: intent.id },
                data: {
                    providerIntentId: prepared.providerIntentId,
                    status: "REQUIRES_PAYMENT",
                    debitAfter: prepared.debitAfter,
                    preDebitStatus: prepared.preDebitStatus,
                    preDebitRef: prepared.preDebitRef,
                },
            });
            return {
                status: "PREPARED",
                intentId: intent.id,
                providerIntentId: prepared.providerIntentId,
                debitAfter: prepared.debitAfter,
                preDebitStatus: prepared.preDebitStatus,
            };
        } catch (err) {
            if (err instanceof MandateCallError && err.outcome === "REFUSED") {
                await prisma.paymentIntent.update({
                    where: { id: intent.id },
                    data: { status: "FAILED", preDebitStatus: null },
                });
                this.logger.warn(
                    `Mandate ${mandate.id}: ${mandate.provider} refused to prepare the charge for invoice ${invoiceId}`,
                );
                return {
                    status: "REFUSED",
                    reason: "PROVIDER_REFUSED",
                    intentId: intent.id,
                };
            }
            this.logger.warn(
                `Mandate ${mandate.id}: no answer from ${mandate.provider} preparing the charge for invoice ${invoiceId}; it waits`,
            );
            return { status: "UNKNOWN", intentId: intent.id };
        }
    }

    /**
     * Step two: ask for the debit on a prepared charge. Only when the
     * mandate is still ACTIVE and its subscription's, the invoice still
     * ISSUED, the notice delivered (or not needed) and `debitAfter` passed.
     * The intent is claimed (REQUIRES_PAYMENT → PROCESSING) before the call,
     * so two runs never both ask. A mandate cancelled in the meantime is
     * never charged: its charge is CANCELLED and the pay link is the way.
     */
    async charge(input: {
        organizationId: string;
        intentId: string;
        now?: Date;
    }): Promise<ChargeResult> {
        const { organizationId, intentId } = input;
        const now = input.now ?? new Date();
        const intent = await prisma.paymentIntent.findFirst({
            where: { id: intentId, organizationId },
            include: {
                viaMandate: true,
                invoice: {
                    select: { status: true, subscriptionId: true },
                },
            },
        });
        if (!intent?.viaMandate || !intent.providerIntentId) {
            return {
                status: "REFUSED",
                reason: "MANDATE_NOT_ACTIVE",
                intentId,
            };
        }
        if (intent.status !== "REQUIRES_PAYMENT") {
            return { status: "ALREADY", intentId, intentStatus: intent.status };
        }
        const mandate = intent.viaMandate;
        const refuse = async (
            reason: ChargeRefusal | "NOTICE_FAILED",
        ): Promise<ChargeResult> => {
            await prisma.paymentIntent.updateMany({
                where: { id: intentId, status: "REQUIRES_PAYMENT" },
                data: { status: "CANCELLED" },
            });
            return { status: "REFUSED", reason, intentId };
        };
        if (mandate.status !== "ACTIVE" || !mandate.providerMandateId) {
            return refuse("MANDATE_NOT_ACTIVE");
        }
        if (intent.invoice?.subscriptionId !== mandate.subscriptionId) {
            return refuse("OTHER_SUBSCRIPTION");
        }
        if (intent.invoice.status !== "ISSUED") {
            return refuse("INVOICE_NOT_PAYABLE");
        }
        if (
            mandate.maxAmountCents === null ||
            intent.amountCents > mandate.maxAmountCents
        ) {
            return refuse("ABOVE_LIMIT");
        }
        const connection = await this.connection(
            organizationId,
            mandate.provider,
        );
        if (!connection) {
            return {
                status: "NOT_YET",
                intentId,
                debitAfter: intent.debitAfter,
            };
        }

        // The notice: its webhook may be late or lost, so ask once it's due.
        let notice = intent.preDebitStatus as PreDebitStatus | null;
        if (
            notice === "PENDING" &&
            intent.debitAfter &&
            now >= intent.debitAfter
        ) {
            try {
                notice = await connection.mandates.getPreDebit({
                    providerIntentId: intent.providerIntentId,
                    credentials: connection.credentials,
                });
                if (notice !== "PENDING") {
                    await prisma.paymentIntent.updateMany({
                        where: { id: intentId, preDebitStatus: "PENDING" },
                        data: { preDebitStatus: notice },
                    });
                }
            } catch {
                notice = "PENDING";
            }
        }
        if (notice === "FAILED") return refuse("NOTICE_FAILED");
        if (
            notice === "PENDING" ||
            notice === null ||
            !intent.debitAfter ||
            now < intent.debitAfter
        ) {
            return {
                status: "NOT_YET",
                intentId,
                debitAfter: intent.debitAfter,
            };
        }

        const claimed = await prisma.paymentIntent.updateMany({
            where: { id: intentId, status: "REQUIRES_PAYMENT" },
            data: { status: "PROCESSING" },
        });
        if (claimed.count === 0) {
            return { status: "ALREADY", intentId, intentStatus: "PROCESSING" };
        }

        try {
            const result = await connection.mandates.charge({
                reference: intent.idempotencyKey ?? intent.id,
                providerIntentId: intent.providerIntentId,
                providerMandateId: mandate.providerMandateId,
                providerCustomerId: mandate.providerCustomerId,
                amountCents: intent.amountCents,
                currency: intent.currency,
                credentials: connection.credentials,
            });
            await prisma.paymentAttempt.create({
                data: {
                    organizationId,
                    paymentIntentId: intentId,
                    provider: mandate.provider,
                    providerRef: result.providerPaymentRef,
                    status: result.status === "FAILED" ? "FAILED" : "CREATED",
                },
            });
            if (result.status === "FAILED") {
                await prisma.paymentIntent.updateMany({
                    where: { id: intentId, status: "PROCESSING" },
                    data: { status: "FAILED" },
                });
                return { status: "FAILED", intentId };
            }
            return {
                status: "CHARGING",
                intentId,
                providerPaymentRef: result.providerPaymentRef,
            };
        } catch (err) {
            const outcome =
                err instanceof MandateCallError ? err.outcome : "UNKNOWN";
            if (outcome === "NOT_YET") {
                await prisma.paymentIntent.updateMany({
                    where: { id: intentId, status: "PROCESSING" },
                    data: { status: "REQUIRES_PAYMENT" },
                });
                return {
                    status: "NOT_YET",
                    intentId,
                    debitAfter: intent.debitAfter,
                };
            }
            if (outcome === "REFUSED") {
                await prisma.paymentIntent.updateMany({
                    where: { id: intentId, status: "PROCESSING" },
                    data: { status: "FAILED" },
                });
                return {
                    status: "REFUSED",
                    reason: "PROVIDER_REFUSED",
                    intentId,
                };
            }
            this.logger.warn(
                `Charge ${intentId}: no answer from ${mandate.provider}; it stays in progress until the provider says`,
            );
            return { status: "UNKNOWN", intentId };
        }
    }

    private connection(
        organizationId: string,
        provider: string,
    ): Promise<MandateConnection | null> {
        return openMandateConnection(this.providers, organizationId, provider, {
            connectedOnly: true,
        });
    }
}
