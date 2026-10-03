import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { fromMinor, toMinor } from "../../common/money";
import type { AutopayChargeTiming } from "../subscriptions/autopay-timing";
import { chargePlan, keptPlan } from "../subscriptions/autopay-timing";
import { chargeKey, enqueueChargeStepInTx } from "../subscriptions/charge-job";
import {
    checkoutOpenOn,
    OPEN_MANDATE_CHARGE,
    openCheckoutWhere,
} from "./charge-under-way";
import { mandateChargingOn } from "./mandate-charge-gate";
import {
    failMandateChargeInTx,
    recordChargeEventInTx,
    settleCapturedChargeInTx,
} from "./mandate-charge-outcome";
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
    | "PROVIDER_REFUSED"
    /**
     * The customer has a pay-link checkout open on the invoice
     * (`checkoutOpenOn`): a debit could take the money twice.
     */
    | "CHECKOUT_OPEN";

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
    /**
     * The charge's planned debit (D13B): never debited before it, even by a
     * method that needs no notice. Absent: as soon as the provider allows.
     */
    notBefore?: Date | null;
    /** The caller's clock, for the open-checkout check (the job's run). */
    now?: Date;
}

const OPEN_CHARGE = OPEN_MANDATE_CHARGE;

/** What queueing a renewal's charge did (D13). */
export type QueueChargeResult =
    /** The charge's intent and its first step are written. */
    | { status: "QUEUED"; intentId: string; key: string }
    /** Above the mandate's limit: MANDATE_LIMIT_LOW, nothing charged. */
    | { status: "LIMIT_LOW" }
    /** No mandate to charge, or charging is off: the pay link, as before. */
    | { status: "NONE" }
    /**
     * The customer has a pay-link checkout open on the invoice
     * (`checkoutOpenOn`): nothing is queued, so they are never charged twice.
     */
    | { status: "CHECKOUT_OPEN" };

/** What a look-up found and did (D13; Retry asks the provider first). */
export type LookUpResult =
    /** The provider had captured it: the invoice is paid now. */
    | "PAID"
    /** The provider declined it: FAILED, RENEWAL_FAILED, the pay link opens. */
    | "FAILED"
    /** Taken, not answered yet: it stays under way. */
    | "PENDING"
    /** No debit was made: the charge may ask for it again. */
    | "NONE"
    /** The provider gave no answer: nothing changed. */
    | "UNKNOWN"
    /** Nothing open to look up. */
    | "ALREADY";

type Tx = Prisma.TransactionClient;

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
                    // A sale's charge only: never D12B's ₹1 autopay check.
                    purpose: null,
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
        if (
            await checkoutOpenOn(prisma, organizationId, invoiceId, input.now)
        ) {
            return made
                ? {
                      status: "REFUSED",
                      reason: "CHECKOUT_OPEN",
                      intentId: made.id,
                  }
                : { status: "REFUSED", reason: "CHECKOUT_OPEN" };
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
            // A planned debit (D13B) holds for a card too, whose provider
            // would take it at once.
            const debitAfter =
                input.notBefore && input.notBefore > prepared.debitAfter
                    ? input.notBefore
                    : prepared.debitAfter;
            await prisma.paymentIntent.update({
                where: { id: intent.id },
                data: {
                    providerIntentId: prepared.providerIntentId,
                    status: "REQUIRES_PAYMENT",
                    debitAfter,
                    preDebitStatus: prepared.preDebitStatus,
                    preDebitRef: prepared.preDebitRef,
                },
            });
            return {
                status: "PREPARED",
                intentId: intent.id,
                providerIntentId: prepared.providerIntentId,
                debitAfter,
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

        /*
         * The claim re-asks the checks above in its own WHERE: the notice
         * call is a provider round trip, and a mandate cancelled, an
         * invoice voided or a pay-link checkout opened while it ran must
         * not be debited. A cancel moves
         * the mandate's open charges to CANCELLED in its transaction
         * (`cancelMandatesInTx`), so a claim either lands first, or waits
         * for that and finds nothing to claim.
         */
        const claimed = await prisma.paymentIntent.updateMany({
            where: {
                id: intentId,
                status: "REQUIRES_PAYMENT",
                viaMandate: {
                    is: {
                        status: "ACTIVE",
                        providerMandateId: { not: null },
                    },
                },
                invoice: {
                    is: {
                        status: "ISSUED",
                        paymentIntents: { none: openCheckoutWhere(now) },
                    },
                },
            },
            data: { status: "PROCESSING" },
        });
        if (claimed.count === 0) {
            const current = await prisma.paymentIntent.findFirst({
                where: { id: intentId, organizationId },
                select: {
                    status: true,
                    viaMandate: { select: { status: true } },
                    invoice: { select: { status: true } },
                },
            });
            // Claimed by another run: money may be moving, whatever has
            // changed since. ALREADY, so the caller looks it up; refusing
            // would leave it PROCESSING with nothing to ask.
            if (current?.status === "PROCESSING") {
                return {
                    status: "ALREADY",
                    intentId,
                    intentStatus: "PROCESSING",
                };
            }
            if (current?.viaMandate?.status !== "ACTIVE") {
                return refuse("MANDATE_NOT_ACTIVE");
            }
            if (current.invoice?.status !== "ISSUED") {
                return refuse("INVOICE_NOT_PAYABLE");
            }
            if (
                await checkoutOpenOn(
                    prisma,
                    organizationId,
                    intent.invoiceId ?? "",
                    now,
                )
            ) {
                return refuse("CHECKOUT_OPEN");
            }
            return {
                status: "ALREADY",
                intentId,
                intentStatus: current.status,
            };
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

    /**
     * The subscription's ACTIVE mandate Saroh may charge now (D13): made at
     * the provider, and its provider's charging on for the business
     * (`mandateChargingOn`, the rollout flag). Null: the pay link, as
     * before D13.
     */
    async chargeableMandate(
        organizationId: string,
        subscriptionId: string,
        db: Pick<Tx, "paymentMandate"> = prisma,
    ): Promise<{
        id: string;
        provider: string;
        maxAmountCents: number | null;
        currency: string;
        method: string | null;
    } | null> {
        const mandate = await db.paymentMandate.findFirst({
            where: {
                organizationId,
                subscriptionId,
                status: "ACTIVE",
                providerMandateId: { not: null },
            },
            select: {
                id: true,
                provider: true,
                maxAmountCents: true,
                currency: true,
                method: true,
            },
        });
        if (!mandate) return null;
        const on = await mandateChargingOn(
            this.providers,
            organizationId,
            mandate.provider,
        );
        return on ? mandate : null;
    }

    /**
     * Queue an autopay charge for a subscription's issued invoice (D13), on
     * the caller's transaction: the renewal that just issued it, or Retry.
     * With a chargeable mandate and the invoice within its limit, the
     * charge's intent (CREATED, under `inv_<invoiceId>_<attempt>`) and the
     * job's first step are written together, so the invoice reads
     * "Autopay charge in progress" from this commit on. Above the limit,
     * MANDATE_LIMIT_LOW is written and nothing is charged. Otherwise
     * nothing is written (never enqueue a no-op).
     *
     * A renewal passes its `schedule` (D13B): under ON_RENEWAL_DATE or
     * ON_DUE_DATE the planned debit is written on the intent
     * (`debitAfter`) and the first step waits until the notice is due, so
     * the setting changing later never moves this charge. Retry, and
     * DAY_AFTER_RENEWAL, prepare at once as D13 did.
     */
    async queueInTx(
        tx: Tx,
        input: {
            organizationId: string;
            subscriptionId: string;
            invoiceId: string;
            now?: Date;
            schedule?: {
                timing: AutopayChargeTiming;
                /** The renewal date: the invoiced period's start. */
                periodStart: Date;
                timezone: string;
            };
            /**
             * A charge queued again after it stood aside for a pay-link
             * checkout (the charge job's resume): the debit it had planned
             * (D13B), kept. Null or absent: as Retry, at once.
             */
            plannedDebitAt?: Date | null;
        },
    ): Promise<QueueChargeResult> {
        const { organizationId, subscriptionId, invoiceId } = input;
        const now = input.now ?? new Date();
        const mandate = await this.chargeableMandate(
            organizationId,
            subscriptionId,
            tx,
        );
        if (!mandate) return { status: "NONE" };
        const invoice = await tx.invoice.findFirst({
            where: { id: invoiceId, organizationId, subscriptionId },
            select: { status: true, total: true, currency: true },
        });
        const amountCents = invoice ? toMinor(invoice.total) : 0;
        if (
            invoice?.status !== "ISSUED" ||
            invoice.currency !== mandate.currency ||
            amountCents <= 0
        ) {
            return { status: "NONE" };
        }
        if (await checkoutOpenOn(tx, organizationId, invoiceId, now)) {
            return { status: "CHECKOUT_OPEN" };
        }
        if (
            mandate.maxAmountCents === null ||
            amountCents > mandate.maxAmountCents
        ) {
            await recordChargeEventInTx(
                tx,
                organizationId,
                invoiceId,
                "MANDATE_LIMIT_LOW",
                {
                    limit:
                        mandate.maxAmountCents === null
                            ? "0.00"
                            : fromMinor(mandate.maxAmountCents),
                    amount: fromMinor(amountCents),
                    currency: invoice.currency,
                },
            );
            return { status: "LIMIT_LOW" };
        }
        const earlier = await tx.paymentIntent.count({
            where: {
                organizationId,
                invoiceId,
                viaMandateId: { not: null },
                purpose: null,
            },
        });
        const key = chargeKey(invoiceId, earlier + 1);
        const plan = input.schedule
            ? chargePlan(input.schedule.timing, {
                  now,
                  periodStart: input.schedule.periodStart,
                  timezone: input.schedule.timezone,
                  method: mandate.method,
              })
            : input.plannedDebitAt
              ? keptPlan(input.plannedDebitAt, now)
              : null;
        const intent = await tx.paymentIntent.create({
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
                // The planned debit, before the provider has the order.
                debitAfter: plan?.debitAt ?? null,
            },
            select: { id: true },
        });
        await enqueueChargeStepInTx(
            tx,
            organizationId,
            { invoiceId, mandateId: mandate.id, key, step: "PREPARE" },
            plan?.prepareAt ?? now,
        );
        return { status: "QUEUED", intentId: intent.id, key };
    }

    /**
     * Whether Saroh may charge autopay for this business at all (D13B): a
     * connected provider that takes mandates, with its charging on
     * (`RAZORPAY_AUTOPAY`). Off, the workspace hides "When autopay
     * charges" (DEC-057's spirit: nothing shown that can't happen).
     */
    async chargingAvailable(organizationId: string): Promise<boolean> {
        const connected = await prisma.merchantPaymentProvider.findMany({
            where: { organizationId, status: "CONNECTED" },
            select: { provider: true },
        });
        for (const c of connected) {
            if (
                await mandateChargingOn(
                    this.providers,
                    organizationId,
                    c.provider,
                )
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether each subscription's unpaid renewal can be retried through
     * its autopay (D13, default 35): `MANDATE` when it has a chargeable
     * mandate and its latest unpaid invoice is within the limit, with no
     * pay-link checkout open on it (`checkoutOpenOn`: Retry by autopay would
     * be refused, so the screen offers the link). Anything else is a pay
     * link. Callers check "a charge is under way" apart.
     */
    async mandateRetryable(
        organizationId: string,
        subscriptionIds: readonly string[],
    ): Promise<Set<string>> {
        const retryable = new Set<string>();
        for (const subscriptionId of new Set(subscriptionIds)) {
            const mandate = await this.chargeableMandate(
                organizationId,
                subscriptionId,
            );
            if (mandate?.maxAmountCents == null) continue;
            const invoice = await prisma.invoice.findFirst({
                where: { organizationId, subscriptionId, status: "ISSUED" },
                orderBy: [
                    { issuedAt: { sort: "desc", nulls: "last" } },
                    { id: "desc" },
                ],
                select: { id: true, total: true, currency: true },
            });
            if (
                invoice?.currency === mandate.currency &&
                toMinor(invoice.total) <= mandate.maxAmountCents &&
                !(await checkoutOpenOn(prisma, organizationId, invoice.id))
            ) {
                retryable.add(subscriptionId);
            }
        }
        return retryable;
    }

    /**
     * Ask the provider what became of a charge's debit, and settle what it
     * says (D13, DEC-026): captured → the invoice is paid (and CHARGED);
     * declined → FAILED and RENEWAL_FAILED; nothing made → the intent can
     * ask for its debit again; in flight or no answer → nothing changes.
     * Retry does this before anything else, so a charge whose webhook was
     * lost is found, never charged twice.
     */
    async lookUp(input: {
        organizationId: string;
        intentId: string;
    }): Promise<LookUpResult> {
        const { organizationId, intentId } = input;
        const intent = await prisma.paymentIntent.findFirst({
            where: {
                id: intentId,
                organizationId,
                viaMandateId: { not: null },
                purpose: null,
            },
            select: {
                status: true,
                provider: true,
                providerIntentId: true,
            },
        });
        if (!intent || !OPEN_CHARGE.includes(intent.status)) return "ALREADY";
        // No order yet: nothing can have been debited on it.
        if (!intent.providerIntentId) return "NONE";
        const connection = await openMandateConnection(
            this.providers,
            organizationId,
            intent.provider,
            // A charge may have been taken before the connection went.
            { connectedOnly: false },
        );
        if (!connection) return "UNKNOWN";
        let found;
        try {
            found = await connection.mandates.findCharge({
                providerIntentId: intent.providerIntentId,
                credentials: connection.credentials,
            });
        } catch {
            this.logger.warn(
                `Charge ${intentId}: no answer from ${intent.provider} looking it up; nothing changed`,
            );
            return "UNKNOWN";
        }
        switch (found.status) {
            case "SUCCEEDED": {
                const settled = await prisma.$transaction((tx) =>
                    settleCapturedChargeInTx(
                        tx,
                        organizationId,
                        intentId,
                        found.providerPaymentRef,
                    ),
                );
                return settled === "ALREADY" ? "ALREADY" : "PAID";
            }
            case "FAILED": {
                const moved = await prisma.$transaction((tx) =>
                    failMandateChargeInTx(tx, organizationId, intentId),
                );
                return moved ? "FAILED" : "ALREADY";
            }
            case "PENDING":
                return "PENDING";
            case "NONE":
                // Claimed, but the provider made no debit: ask again.
                await prisma.paymentIntent.updateMany({
                    where: { id: intentId, status: "PROCESSING" },
                    data: { status: "REQUIRES_PAYMENT" },
                });
                return "NONE";
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
