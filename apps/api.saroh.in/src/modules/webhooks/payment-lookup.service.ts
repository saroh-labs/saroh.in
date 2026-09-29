import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { OPEN_INTENT_STATUSES } from "../payments/intent-state";
import { openProviderCredentials } from "../payments/provider-credentials";
import type {
    MerchantProvider,
    OrderPayment,
    ProviderCredentials,
    ProviderFactory,
} from "../payments/providers/provider.port";
import { PROVIDER_FACTORY } from "../payments/providers/provider.port";
import { dueForLookup } from "./payment-lookup-schedule";
import { razorpayMandateLink } from "./providers/razorpay-mandate-events";
import type { NormalizedWebhookEvent } from "./providers/webhook-provider.port";
import { WebhooksService } from "./webhooks.service";

/**
 * What one look-up came to.
 *
 * - `SETTLED` — the provider has the money, and this look-up settled it.
 * - `ALREADY_SETTLED` — it has the money, and Saroh had it already (the
 *   webhook, or another look-up, came first).
 * - `NOT_PAID` — no captured payment on the order yet.
 * - `MISMATCH` — a captured payment whose amount or currency is not the
 *   intent's: never settled, and logged for someone to look at.
 * - `UNAVAILABLE` — nothing to ask: no connection, or an adapter that can't
 *   look an order up.
 * - `ERROR` — the provider could not say. Nothing settled.
 */
export type LookupOutcome =
    | "SETTLED"
    | "ALREADY_SETTLED"
    | "NOT_PAID"
    | "MISMATCH"
    | "UNAVAILABLE"
    | "ERROR";

/** A count per outcome, and how many intents were asked about. */
export type LookupCounts = Record<LookupOutcome, number> & { looked: number };

/** An open intent, as a look-up reads it. */
interface LookupIntent {
    id: string;
    organizationId: string;
    provider: string;
    providerIntentId: string | null;
    orderId: string | null;
    invoiceId: string | null;
    amountCents: number;
    currency: string;
    status: string;
}

const INTENT_SELECT = {
    id: true,
    organizationId: true,
    provider: true,
    providerIntentId: true,
    orderId: true,
    invoiceId: true,
    amountCents: true,
    currency: true,
    status: true,
} as const;

/** Intents the sweep asks about per run; a full batch runs again at once. */
export const SWEEP_BATCH = 50;

/** Intents `payments reconcile` asks about per page. */
const RECONCILE_PAGE = 100;

/** The checkout's return, as the merchant's site posts it. */
export interface CheckoutReturn {
    provider: string;
    /** The provider's order id (`razorpay_order_id`, Cashfree's order). */
    providerOrderId: string;
    /** `razorpay_payment_id`; Cashfree's window returns none. */
    providerPaymentId?: string;
    /** `razorpay_signature`; Cashfree's window returns none. */
    signature?: string;
}

/**
 * Confirm a payment by asking the provider (P1, issue #710).
 *
 * A booking paid in Razorpay's test mode stayed "Awaiting payment" because
 * its webhook never came, and its hold ran out with the money taken. The
 * webhook stays, but it is no longer the only way money is seen:
 *
 * 1. **The checkout's signed return** ({@link confirmCheckoutReturn}). The
 *    page posts what the provider's window handed it. Razorpay's signature
 *    is checked with the business's own key secret, then the payment is
 *    read from Razorpay — its order, its status and its amount are the
 *    provider's, never the browser's.
 * 2. **The pending sweep** ({@link sweep}): intents still open a few
 *    minutes on are asked about, on a pause that grows with their age
 *    (`payment-lookup-schedule.ts`); and a booking hold is asked about
 *    before it is released ({@link confirmHoldPayment}).
 * 3. **`payments reconcile`** ({@link reconcileOrganization}): every open
 *    intent of one business, for a payment already stuck.
 *
 * Every one settles through the webhook's own reconciliation
 * ({@link WebhooksService.settleLookedUp}), so whichever of them and the
 * webhook comes first settles the payment, and the rest change nothing.
 * Only a CAPTURED payment at exactly the intent's amount and currency
 * settles; a failure the provider reports is left to its webhook.
 */
@Injectable()
export class PaymentLookupService {
    private readonly logger = new Logger(PaymentLookupService.name);

    constructor(
        @Inject(PROVIDER_FACTORY) private readonly providers: ProviderFactory,
        private readonly webhooks: WebhooksService,
    ) {}

    /**
     * The checkout's return (the public `POST /public/payments/return`).
     * The business is the one whose intent names the provider's order —
     * never one the caller names. A return that doesn't check out — an
     * order Saroh never made, or a signature the business's key secret
     * didn't make — is a 400 and writes nothing. `confirmed` says the
     * provider has the money and Saroh has it recorded; false leaves the
     * page waiting, as it did for the webhook.
     */
    async confirmCheckoutReturn(
        input: CheckoutReturn,
    ): Promise<{ confirmed: boolean }> {
        const provider = input.provider.toUpperCase();
        const intent = await prisma.paymentIntent.findFirst({
            where: { provider, providerIntentId: input.providerOrderId },
            orderBy: { createdAt: "desc" },
            select: INTENT_SELECT,
        });
        if (!intent) throw invalidReturn();

        const connection = await this.openConnection(intent);
        if (!connection) throw invalidReturn();
        const { adapter, credentials } = connection;

        // A provider whose window signs its return must have signed this
        // one, with this business's key secret.
        if (adapter.verifyCheckoutReturn) {
            const signed =
                !!input.providerPaymentId &&
                !!input.signature &&
                adapter.verifyCheckoutReturn({
                    providerIntentId: input.providerOrderId,
                    providerPaymentRef: input.providerPaymentId,
                    signature: input.signature,
                    credentials,
                });
            if (!signed) throw invalidReturn();
        }

        if (intent.status === "SUCCEEDED") return { confirmed: true };
        const outcome = await this.lookUp(intent, connection, {
            paymentRef: input.providerPaymentId,
        });
        return {
            confirmed: outcome === "SETTLED" || outcome === "ALREADY_SETTLED",
        };
    }

    /**
     * One run of the pending sweep: the open intents due an ask at `now`
     * (`dueForLookup`), oldest ask first. Never throws for one intent; a
     * failed ask is counted and left for its next turn.
     */
    async sweep(now: Date): Promise<LookupCounts & { full: boolean }> {
        const due = await prisma.paymentIntent.findMany({
            where: dueForLookup(now),
            orderBy: [{ lastLookupAt: { sort: "asc", nulls: "first" } }],
            take: SWEEP_BATCH,
            select: INTENT_SELECT,
        });
        const counts = await this.lookUpAll(due);
        if (counts.SETTLED > 0 || counts.MISMATCH > 0) {
            this.logger.log(
                `Pending payment sweep: asked ${counts.looked}, settled ${counts.SETTLED}, mismatched ${counts.MISMATCH}`,
            );
        }
        return { ...counts, full: due.length === SWEEP_BATCH };
    }

    /**
     * Before a booking hold is released: ask about every open intent of its
     * invoice, whatever its turn. `PAID` — the money was there and is now
     * settled, so the payment has confirmed the hold or, when its place
     * went to someone else, recorded the money as owed back
     * (`confirmHoldInTx`, the webhook's path). `UNKNOWN` — a provider could
     * not say. `NOT_PAID` — nothing to wait for.
     */
    async confirmHoldPayment(
        bookingId: string,
    ): Promise<"PAID" | "NOT_PAID" | "UNKNOWN"> {
        const intents = await prisma.paymentIntent.findMany({
            where: {
                status: { in: [...OPEN_INTENT_STATUSES] },
                providerIntentId: { not: null },
                invoice: { bookingId, source: "BOOKING" },
            },
            select: INTENT_SELECT,
        });
        const counts = await this.lookUpAll(intents);
        if (counts.SETTLED + counts.ALREADY_SETTLED > 0) return "PAID";
        return counts.ERROR > 0 ? "UNKNOWN" : "NOT_PAID";
    }

    /**
     * `payments reconcile` for one business: every intent still open, of
     * any age, asked about once. Idempotent — a settled intent is no longer
     * open, so a second run asks about what is left. Counts only.
     */
    async reconcileOrganization(organizationId: string): Promise<LookupCounts> {
        const total = emptyCounts();
        let cursor: string | undefined;
        for (;;) {
            const page = await prisma.paymentIntent.findMany({
                where: {
                    organizationId,
                    status: { in: [...OPEN_INTENT_STATUSES] },
                    providerIntentId: { not: null },
                },
                orderBy: { id: "asc" },
                take: RECONCILE_PAGE,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: INTENT_SELECT,
            });
            if (page.length === 0) break;
            const counts = await this.lookUpAll(page);
            for (const key of Object.keys(total) as (keyof LookupCounts)[]) {
                total[key] += counts[key];
            }
            cursor = page[page.length - 1].id;
            if (page.length < RECONCILE_PAGE) break;
        }
        return total;
    }

    /** Ask about each intent in turn, one connection per business. */
    private async lookUpAll(intents: LookupIntent[]): Promise<LookupCounts> {
        const counts = emptyCounts();
        const connections = new Map<string, Connection | null>();
        for (const intent of intents) {
            counts.looked += 1;
            let outcome: LookupOutcome;
            try {
                const key = `${intent.organizationId}:${intent.provider}`;
                if (!connections.has(key)) {
                    connections.set(key, await this.openConnection(intent));
                }
                const connection = connections.get(key) ?? null;
                outcome = connection
                    ? await this.lookUp(intent, connection, {})
                    : await this.stamp(intent, "UNAVAILABLE");
            } catch (error) {
                this.logger.error(
                    `Payment lookup for intent ${intent.id} failed: ${String(error)}`,
                );
                outcome = "ERROR";
            }
            counts[outcome] += 1;
        }
        return counts;
    }

    /**
     * Ask the provider about one intent's order and settle a captured
     * payment at the intent's amount. `paymentRef` (a signed return) settles
     * that payment only.
     */
    private async lookUp(
        intent: LookupIntent,
        connection: Connection,
        opts: { paymentRef?: string },
    ): Promise<LookupOutcome> {
        const { adapter, credentials } = connection;
        const providerIntentId = intent.providerIntentId;
        if (!adapter.findOrderPayments || !providerIntentId) {
            return this.stamp(intent, "UNAVAILABLE");
        }

        let payments: OrderPayment[];
        try {
            payments = await adapter.findOrderPayments({
                providerIntentId,
                merchantRef: intent.orderId ?? intent.invoiceId,
                credentials,
            });
        } catch (error) {
            this.logger.warn(
                `Could not ask ${intent.provider} about intent ${intent.id}: ${String(error)}`,
            );
            return this.stamp(intent, "ERROR");
        }

        const captured = payments.find(
            (p) =>
                p.status === "CAPTURED" &&
                (!opts.paymentRef || p.providerPaymentRef === opts.paymentRef),
        );
        if (!captured) return this.stamp(intent, "NOT_PAID");

        if (
            captured.amountCents !== intent.amountCents ||
            (captured.currency ?? "").toUpperCase() !==
                intent.currency.toUpperCase()
        ) {
            this.logger.warn(
                `Payment ${captured.providerPaymentRef} on ${intent.provider} order ${providerIntentId} is ${String(captured.amountCents)} ${String(captured.currency)}, not intent ${intent.id}'s ${intent.amountCents} ${intent.currency}; not settled`,
            );
            return this.stamp(intent, "MISMATCH");
        }

        const { applied } = await this.webhooks.settleLookedUp(
            intent.provider,
            intent.organizationId,
            settlementEvent(
                intent.provider,
                providerIntentId,
                intent,
                captured,
            ),
        );
        if (applied) {
            this.logger.log(
                `Payment ${captured.providerPaymentRef} settled intent ${intent.id} on the provider's own answer`,
            );
        }
        return this.stamp(intent, applied ? "SETTLED" : "ALREADY_SETTLED");
    }

    /** Note when the intent was last asked about; give back the outcome. */
    private async stamp(
        intent: LookupIntent,
        outcome: LookupOutcome,
    ): Promise<LookupOutcome> {
        await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { lastLookupAt: new Date() },
            select: { id: true },
        });
        return outcome;
    }

    /**
     * The business's connection to the intent's provider, opened for this
     * round of calls. Its status is ignored, as the webhook's secret is: a
     * payment made before a disconnect is still the business's money.
     */
    private async openConnection(
        intent: LookupIntent,
    ): Promise<Connection | null> {
        const row = await prisma.merchantPaymentProvider.findUnique({
            where: {
                organizationId_provider: {
                    organizationId: intent.organizationId,
                    provider: intent.provider,
                },
            },
        });
        if (!row) return null;
        let adapter: MerchantProvider;
        try {
            adapter = this.providers.get(row.provider);
        } catch {
            return null;
        }
        return { adapter, credentials: openProviderCredentials(row) };
    }
}

/** An adapter and its credentials, in memory only, for one round of calls. */
interface Connection {
    adapter: MerchantProvider;
    credentials: ProviderCredentials;
}

/**
 * The provider's answer as the webhook's reconciliation reads an event: a
 * success on the intent's own order, with the payment's id and fee, and —
 * for an autopay authorisation's payment — the token it made (D19).
 */
function settlementEvent(
    provider: string,
    providerIntentId: string,
    intent: LookupIntent,
    payment: OrderPayment,
): NormalizedWebhookEvent {
    const recurring = payment.recurring;
    const mandateLink =
        provider === "RAZORPAY" && recurring
            ? razorpayMandateLink({
                  payload: {
                      payment: {
                          entity: {
                              token_id: recurring.tokenId,
                              customer_id: recurring.customerId,
                              method: recurring.method,
                              invoice_id: recurring.invoiceId,
                              order_id: providerIntentId,
                          },
                      },
                  },
              })
            : undefined;
    return {
        providerEventId: `lookup:${payment.providerPaymentRef}`,
        eventType: "payment.lookup",
        outcome: "SUCCEEDED",
        providerIntentId,
        orderRef: intent.orderId ?? intent.invoiceId ?? undefined,
        providerPaymentRef: payment.providerPaymentRef,
        feeCents: payment.feeCents,
        mandateLink,
    };
}

function emptyCounts(): LookupCounts {
    return {
        looked: 0,
        SETTLED: 0,
        ALREADY_SETTLED: 0,
        NOT_PAID: 0,
        MISMATCH: 0,
        UNAVAILABLE: 0,
        ERROR: 0,
    };
}

function invalidReturn(): BadRequestException {
    return new BadRequestException(
        "This payment couldn't be checked. If you paid, the business will see it shortly.",
    );
}
