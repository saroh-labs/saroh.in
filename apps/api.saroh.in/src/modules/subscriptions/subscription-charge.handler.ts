import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { fromMinor, toMoneyString } from "../../common/money";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { OPEN_MANDATE_CHARGE } from "../payments/charge-under-way";
import type { ChargeFailure } from "../payments/mandate-charge-outcome";
import {
    failMandateChargeInTx,
    recordChargeEventInTx,
} from "../payments/mandate-charge-outcome";
import {
    earliestDebitAt,
    MandateChargesService,
} from "../payments/mandate-charges.service";
import type { ChargeJobPayload } from "./charge-job";
import {
    chargePayloadOf,
    DEBIT_RETRY_MS,
    DEBIT_TRIES,
    enqueueChargeStepInTx,
    LOOK_AFTER_MS,
    LOOK_RETRY_MS,
    LOOK_TRIES,
    PREPARE_RETRY_MS,
    PREPARE_TRIES,
} from "./charge-job";
import type { EarlyDropReason } from "./early-renewal";
import { dropEarlyRenewalInTx } from "./early-renewal";
import { JOB, subscriptionEventLog } from "./subscription-events";

export { SUBSCRIPTION_CHARGE_TYPE } from "./charge-job";

/**
 * Runs a renewal's autopay charge, step by step (round-2 D13): the
 * provider's order with its pre-debit notice, the debit once the notice
 * allows it, and a look-up when the payment's webhook hasn't settled it.
 * Every step re-reads the charge, so a run delivered twice does nothing
 * twice: the order is found by its key, the debit is claimed before it is
 * asked for, and each next step is written once (`enqueueChargeStepInTx`).
 *
 * Nothing is charged unless the invoice is ISSUED and unpaid, is the
 * mandate's subscription's, the subscription isn't CANCELLED, the mandate
 * is ACTIVE, the invoice is within its limit (else MANDATE_LIMIT_LOW) and
 * no other charge is open — `MandateChargesService` checks each, again at
 * the debit. Charging off (the rollout flag) or a mandate gone meanwhile
 * lets the charge go quietly: the invoice keeps its pay link.
 *
 * What came of it is written by `mandate-charge-outcome.ts`: CHARGED,
 * RENEWAL_FAILED (the pay link opens again; the team is told of a
 * decline), or MANDATE_LIMIT_LOW. Saroh sends the customer nothing.
 */
@Injectable()
export class SubscriptionChargeHandler {
    private readonly logger = new Logger(SubscriptionChargeHandler.name);

    constructor(private readonly charges: MandateChargesService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = chargePayloadOf(job.payload);
        const organizationId = job.organizationId;
        if (!payload || !organizationId) {
            this.logger.warn(
                `subscription.charge job ${job.id} names no charge; nothing done`,
            );
            return;
        }
        await runInOrgContext(organizationId, () =>
            this.run(organizationId, payload, new Date()),
        );
    };

    /** One step of one charge. Exposed for the specs' clock. */
    async run(
        organizationId: string,
        payload: ChargeJobPayload,
        now: Date,
    ): Promise<void> {
        switch (payload.step) {
            case "PREPARE":
                return this.prepare(organizationId, payload, now);
            case "DEBIT":
                return this.debit(organizationId, payload, now);
            case "LOOK":
                return this.look(organizationId, payload, now);
        }
    }

    private async prepare(
        organizationId: string,
        p: ChargeJobPayload,
        now: Date,
    ): Promise<void> {
        const intent = await this.intentOf(organizationId, p);
        if (!intent || !OPEN_MANDATE_CHARGE.includes(intent.status)) return;
        if (!(await this.stillCharging(organizationId, p, intent.id, now))) {
            return;
        }

        // The merchant's timing (D13B) planned the debit when the charge was
        // queued; the setting changing since never moves it.
        const planned = intent.debitAfter;
        const soonest = earliestDebitAt(now);
        const result = await this.charges.prepareCharge({
            organizationId,
            mandateId: p.mandateId,
            invoiceId: p.invoiceId,
            key: p.key,
            debitAt: planned && planned > soonest ? planned : soonest,
            notBefore: planned,
        });
        switch (result.status) {
            case "PREPARED": {
                // No notice to wait on: at once, or at the planned debit.
                const debitAt =
                    result.preDebitStatus === "NOT_NEEDED"
                        ? result.debitAfter > now
                            ? result.debitAfter
                            : now
                        : result.debitAfter;
                await prisma.$transaction((tx) =>
                    enqueueChargeStepInTx(
                        tx,
                        organizationId,
                        { ...p, step: "DEBIT", tries: 0 },
                        debitAt,
                    ),
                );
                return;
            }
            case "UNKNOWN": {
                const tries = (p.tries ?? 0) + 1;
                if (tries >= PREPARE_TRIES) {
                    await this.letGo(organizationId, intent.id);
                    this.logger.warn(
                        `Charge ${intent.id}: the provider never answered its order; the invoice keeps its pay link`,
                    );
                    return;
                }
                await prisma.$transaction((tx) =>
                    enqueueChargeStepInTx(
                        tx,
                        organizationId,
                        { ...p, tries },
                        new Date(now.getTime() + PREPARE_RETRY_MS),
                    ),
                );
                return;
            }
            case "REFUSED":
                await this.letGo(organizationId, intent.id);
                if (result.reason === "ABOVE_LIMIT") {
                    await this.limitLow(organizationId, p);
                } else if (result.reason === "PROVIDER_REFUSED") {
                    await this.failed(
                        organizationId,
                        p.invoiceId,
                        intent.id,
                        "PROVIDER_REFUSED",
                    );
                } else if (result.reason === "CHECKOUT_OPEN") {
                    await this.stoodAside(organizationId, p.invoiceId);
                }
                return;
        }
    }

    private async debit(
        organizationId: string,
        p: ChargeJobPayload,
        now: Date,
    ): Promise<void> {
        const intent = await this.intentOf(organizationId, p);
        if (!intent || !OPEN_MANDATE_CHARGE.includes(intent.status)) return;
        // Claimed already: a delivery before this one may have died between
        // the claim and writing its look-up, and money may have moved. Look
        // it up whatever has happened since — a mandate or subscription
        // cancelled meanwhile doesn't close a PROCESSING charge (`letGo`
        // leaves it), so the gate below would leave it unasked for good.
        if (intent.status === "PROCESSING") {
            return this.lookSoon(organizationId, p, now);
        }
        if (!(await this.stillCharging(organizationId, p, intent.id, now))) {
            return;
        }

        const result = await this.charges.charge({
            organizationId,
            intentId: intent.id,
            now,
        });
        switch (result.status) {
            case "CHARGING":
                // The payment's webhook settles it; look if it doesn't.
                return this.next(
                    organizationId,
                    { ...p, step: "LOOK", tries: 0 },
                    new Date(now.getTime() + LOOK_AFTER_MS),
                );
            case "UNKNOWN":
                // Unsure whether it was taken: look it up, never re-send.
                return this.next(
                    organizationId,
                    { ...p, step: "LOOK", tries: 0 },
                    new Date(now.getTime() + DEBIT_RETRY_MS),
                );
            case "NOT_YET": {
                const tries = (p.tries ?? 0) + 1;
                if (tries >= DEBIT_TRIES) {
                    await this.letGo(organizationId, intent.id);
                    return this.failed(
                        organizationId,
                        p.invoiceId,
                        intent.id,
                        "NOTICE_NOT_DELIVERED",
                    );
                }
                const soonest = new Date(now.getTime() + DEBIT_RETRY_MS);
                const at =
                    result.debitAfter && result.debitAfter > soonest
                        ? result.debitAfter
                        : soonest;
                return this.next(organizationId, { ...p, tries }, at);
            }
            case "FAILED":
                // Declined as it was asked: charge() has marked it FAILED.
                return this.failed(
                    organizationId,
                    p.invoiceId,
                    intent.id,
                    "DECLINED",
                );
            case "REFUSED":
                if (result.reason === "NOTICE_FAILED") {
                    return this.failed(
                        organizationId,
                        p.invoiceId,
                        intent.id,
                        "NOTICE_FAILED",
                    );
                }
                if (result.reason === "ABOVE_LIMIT") {
                    return this.limitLow(organizationId, p);
                }
                if (result.reason === "PROVIDER_REFUSED") {
                    return this.failed(
                        organizationId,
                        p.invoiceId,
                        intent.id,
                        "PROVIDER_REFUSED",
                    );
                }
                if (result.reason === "CHECKOUT_OPEN") {
                    return this.stoodAside(organizationId, p.invoiceId);
                }
                // Paid another way, the mandate ended, or another
                // subscription's: nothing to say; the pay link stands.
                return;
            case "ALREADY":
                // Claimed and still PROCESSING: a delivery before this one
                // may have died between the claim and writing its look-up,
                // so nothing would ever ask. Unsure, as UNKNOWN is: look it
                // up (a look-up already waiting is kept, not doubled).
                if (result.intentStatus === "PROCESSING") {
                    return this.lookSoon(organizationId, p, now);
                }
                return;
        }
    }

    private async look(
        organizationId: string,
        p: ChargeJobPayload,
        now: Date,
    ): Promise<void> {
        const intent = await this.intentOf(organizationId, p);
        if (!intent) return;
        const found = await this.charges.lookUp({
            organizationId,
            intentId: intent.id,
        });
        if (found === "NONE") {
            // The provider made no debit on it: ask for it now.
            return this.next(
                organizationId,
                { ...p, step: "DEBIT", tries: 0 },
                now,
            );
        }
        if (found !== "PENDING" && found !== "UNKNOWN") return;
        const tries = (p.tries ?? 0) + 1;
        if (tries >= LOOK_TRIES) {
            // Left open, never guessed (DEC-026): Retry asks again.
            this.logger.warn(
                `Charge ${intent.id}: still unanswered after ${tries} look-ups; left in progress for Retry`,
            );
            return;
        }
        return this.next(
            organizationId,
            { ...p, tries },
            new Date(now.getTime() + LOOK_RETRY_MS),
        );
    }

    /** The charge's intent under its key, or null when there is none. */
    private intentOf(organizationId: string, p: ChargeJobPayload) {
        return prisma.paymentIntent.findFirst({
            where: {
                organizationId,
                invoiceId: p.invoiceId,
                idempotencyKey: p.key,
                viaMandateId: p.mandateId,
                purpose: null,
            },
            select: { id: true, status: true, debitAfter: true },
        });
    }

    /**
     * Whether this charge may still go ahead: its provider's charging is
     * on, and the subscription hasn't ended. If not, it is let go (a
     * charge not yet asked for is CANCELLED) and the pay link stands.
     *
     * An early renewal invoice (D13B) whose subscription has since been
     * set to end, paused or cancelled before its period began is dropped
     * here too — voided or credited, its charge cancelled — should the
     * write that stopped it not have dropped it already.
     */
    private async stillCharging(
        organizationId: string,
        p: ChargeJobPayload,
        intentId: string,
        now: Date,
    ): Promise<boolean> {
        const invoice = await prisma.invoice.findFirst({
            where: { id: p.invoiceId, organizationId },
            select: {
                subscriptionId: true,
                periodStart: true,
                subscription: {
                    select: {
                        status: true,
                        cancelAtPeriodEnd: true,
                        currentPeriodEnd: true,
                    },
                },
            },
        });
        const sub = invoice?.subscription;
        // Early: the next period's invoice, before that period begins.
        if (
            invoice?.subscriptionId &&
            sub &&
            invoice.periodStart &&
            invoice.periodStart > now &&
            invoice.periodStart.getTime() === sub.currentPeriodEnd.getTime() &&
            (sub.status !== "ACTIVE" || sub.cancelAtPeriodEnd)
        ) {
            await this.dropEarly(
                organizationId,
                invoice.subscriptionId,
                invoice.periodStart,
                sub.status === "PAUSED" ? "PAUSED" : "CANCELLED",
                now,
            );
            await this.letGo(organizationId, intentId);
            return false;
        }
        const live =
            invoice?.subscriptionId &&
            invoice.subscription?.status !== "CANCELLED" &&
            (await this.charges.chargeableMandate(
                organizationId,
                invoice.subscriptionId,
            ));
        if (live && live.id === p.mandateId) return true;
        await this.letGo(organizationId, intentId);
        return false;
    }

    /** The early invoice dropped under its subscription's lock (D13B). */
    private async dropEarly(
        organizationId: string,
        subscriptionId: string,
        periodStart: Date,
        reason: EarlyDropReason,
        now: Date,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${subscriptionId} AND "organizationId" = ${organizationId} FOR UPDATE`;
            await dropEarlyRenewalInTx(tx, {
                organizationId,
                subscriptionId,
                periodStart,
                reason,
                now,
                log: subscriptionEventLog(
                    tx,
                    organizationId,
                    subscriptionId,
                    JOB,
                ),
            });
        });
    }

    /** A charge not yet asked for is let go: CANCELLED, so the pay link opens. */
    private async letGo(organizationId: string, intentId: string) {
        await prisma.paymentIntent.updateMany({
            where: {
                id: intentId,
                organizationId,
                status: { in: ["CREATED", "REQUIRES_PAYMENT"] },
            },
            data: { status: "CANCELLED" },
        });
    }

    /** A look-up soon, for a claimed debit nothing else will ask about. */
    private lookSoon(
        organizationId: string,
        p: ChargeJobPayload,
        now: Date,
    ): Promise<void> {
        return this.next(
            organizationId,
            { ...p, step: "LOOK", tries: 0 },
            new Date(now.getTime() + DEBIT_RETRY_MS),
        );
    }

    private next(
        organizationId: string,
        payload: ChargeJobPayload,
        runAt: Date,
    ): Promise<void> {
        return prisma.$transaction((tx) =>
            enqueueChargeStepInTx(tx, organizationId, payload, runAt),
        );
    }

    /**
     * RENEWAL_FAILED for a charge that has already moved (charge() or
     * prepareCharge() did it, once). A decline also tells the team (F14):
     * its alert words only a FAILED intent.
     */
    private async failed(
        organizationId: string,
        invoiceId: string,
        intentId: string,
        reason: ChargeFailure,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            // Still open (a give-up): moved and written by the one helper.
            if (
                await failMandateChargeInTx(
                    tx,
                    organizationId,
                    intentId,
                    reason,
                )
            )
                return;
            await recordChargeEventInTx(
                tx,
                organizationId,
                invoiceId,
                "RENEWAL_FAILED",
                { reason },
            );
            await enqueueTeamAlert(tx, organizationId, {
                event: "failed",
                invoiceId,
                paymentIntentId: intentId,
            });
        });
    }

    /**
     * Autopay stood aside for a pay-link checkout the customer had open on
     * the invoice (its charge is already CANCELLED): RENEWAL_FAILED
     * (CHECKOUT_OPEN), so the renewal reads as not charged on Home and the
     * subscription's history, and Retry is offered — by the pay link while
     * the checkout is open, by autopay once it lapses. Not the team's
     * "Payment failed" alert: nothing was declined, and that alert words
     * only a FAILED intent.
     */
    private async stoodAside(
        organizationId: string,
        invoiceId: string,
    ): Promise<void> {
        await prisma.$transaction((tx) =>
            recordChargeEventInTx(
                tx,
                organizationId,
                invoiceId,
                "RENEWAL_FAILED",
                { reason: "CHECKOUT_OPEN" },
            ),
        );
    }

    /** Above the limit at the debit: MANDATE_LIMIT_LOW, nothing charged. */
    private async limitLow(
        organizationId: string,
        p: ChargeJobPayload,
    ): Promise<void> {
        const [mandate, invoice] = await Promise.all([
            prisma.paymentMandate.findFirst({
                where: { id: p.mandateId, organizationId },
                select: { maxAmountCents: true },
            }),
            prisma.invoice.findFirst({
                where: { id: p.invoiceId, organizationId },
                select: { total: true, currency: true },
            }),
        ]);
        if (!invoice) return;
        await prisma.$transaction((tx) =>
            recordChargeEventInTx(
                tx,
                organizationId,
                p.invoiceId,
                "MANDATE_LIMIT_LOW",
                {
                    limit: fromMinor(mandate?.maxAmountCents ?? 0),
                    amount: toMoneyString(invoice.total),
                    currency: invoice.currency,
                },
            ),
        );
    }
}
