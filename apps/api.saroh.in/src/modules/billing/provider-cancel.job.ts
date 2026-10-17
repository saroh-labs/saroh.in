import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    businessLeaving,
    errorResult,
    logDeletionProviderCall,
} from "../organizations/deletion-provider-log";
import { raiseBillingOpsNoticeInTx } from "./billing-ops-notice";
import { isOneTime } from "./billing-term";
import type {
    BillingProviderFactory,
    SubscriptionStanding,
} from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

/**
 * Ask Saroh's billing provider to cancel a provider subscription (pricing
 * catalogue U15): one superseded by a checkout, one a business is leaving
 * for Free at the end of its period, a checkout given up on. Written on the
 * caller's transaction (the outbox), so the change and the request to the
 * provider commit together, and a provider that is down never undoes a
 * change: the queue retries it.
 *
 * A refusal (a 4xx) is not taken as settled (17 Oct 2026): Razorpay's docs
 * say it cancels only an active or authenticated subscription, and in test
 * mode it refuses an end-with-the-cycle cancel of one that is created or
 * authenticated ("no billing cycle is going on") but takes a cancel now. A
 * refused one would go on billing while Saroh reads Free. The job asks
 * where the subscription stands: ended, or in its last cycle when told to
 * end with it, is done; created or authorised with no cycle running is
 * cancelled now instead; anything else is asked again later,
 * with a growing pause (`CANCEL_RETRY_DELAYS_MS`, its own count in the
 * payload so the queue's quick retries aren't spent), and an operator is
 * told after `CANCEL_ALERT_AFTER` tries. A charge that lands meanwhile is
 * the webhook's to settle (`billing-webhook.service.ts`).
 */
export const BILLING_PROVIDER_CANCEL_TYPE = "billing.provider.cancel";

export interface ProviderCancelPayload {
    provider: string;
    providerSubscriptionId: string;
    /** End with the period already paid (true) or now (false). */
    atCycleEnd: boolean;
    /** Refused tries so far (absent: none). */
    tries?: number;
}

const MINUTE = 60 * 1000;
/** The pause before each retry of a refused cancel: 15 minutes, up to a day. */
export const CANCEL_RETRY_DELAYS_MS: readonly number[] = [
    15 * MINUTE,
    30 * MINUTE,
    60 * MINUTE,
    2 * 60 * MINUTE,
    4 * 60 * MINUTE,
    8 * 60 * MINUTE,
    16 * 60 * MINUTE,
    24 * 60 * MINUTE,
];
/** After this many refused tries an operator is told (about two days). */
export const CANCEL_ALERT_AFTER = 8;
/** After this many it stops asking (about a week), and says so again. */
export const CANCEL_GIVE_UP_AFTER = 14;

export async function enqueueProviderCancel(
    tx: Pick<Prisma.TransactionClient, "job">,
    input: ProviderCancelPayload & { organizationId: string | null },
    runAt?: Date,
): Promise<void> {
    await tx.job.create({
        data: {
            type: BILLING_PROVIDER_CANCEL_TYPE,
            organizationId: input.organizationId,
            payload: {
                provider: input.provider,
                providerSubscriptionId: input.providerSubscriptionId,
                atCycleEnd: input.atCycleEnd,
                ...(input.tries ? { tries: input.tries } : {}),
            },
            ...(runAt ? { runAt } : {}),
        },
    });
}

/**
 * Take back every cancel still waiting for a provider subscription Saroh
 * keeps after all (a payment it honours). One already running may still
 * land; the webhook's `cancelled` then runs the plan to what was paid.
 */
export async function withdrawProviderCancelsInTx(
    tx: Pick<Prisma.TransactionClient, "job">,
    providerSubscriptionId: string,
): Promise<number> {
    const r = await tx.job.updateMany({
        where: {
            type: BILLING_PROVIDER_CANCEL_TYPE,
            status: "PENDING",
            payload: {
                path: ["providerSubscriptionId"],
                equals: providerSubscriptionId,
            },
        },
        data: { status: "CANCELLED", lastError: "withdrawn: payment honoured" },
    });
    return r.count;
}

function isRefused(error: unknown): error is BillingProviderError {
    return error instanceof BillingProviderError && error.kind === "REFUSED";
}

@Injectable()
export class ProviderCancelHandler {
    private readonly logger = new Logger(ProviderCancelHandler.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = job.payload as Partial<ProviderCancelPayload> | null;
        if (!p?.provider || !p.providerSubscriptionId) {
            this.logger.error(
                `billing_provider_cancel_bad_payload job=${job.id}`,
            );
            return;
        }
        // A business on its way out (#921): this call is on its deletion
        // trail, in the one line an operator follows it by.
        const leaving = job.organizationId
            ? await businessLeaving(job.organizationId).catch(() => false)
            : false;
        const trail = (result: string) => {
            if (!leaving || !job.organizationId || !p.provider) return;
            logDeletionProviderCall(this.logger, {
                organizationId: job.organizationId,
                provider: p.provider,
                call:
                    p.atCycleEnd === false
                        ? "billing.cancel"
                        : "billing.cancel_at_period_end",
                result,
                ref: p.providerSubscriptionId,
            });
        };
        const provider = this.providers.get(p.provider);
        const ref = p.providerSubscriptionId;
        // A year paid once is a provider order: nothing to cancel, and
        // nothing more it can charge (DEC-093). Never asked, never retried.
        const checkout = await prisma.billingCheckout.findUnique({
            where: {
                provider_providerSubscriptionId: {
                    provider: p.provider,
                    providerSubscriptionId: ref,
                },
            },
            select: { providerPlanId: true },
        });
        if (checkout && isOneTime(checkout)) {
            this.logger.log(
                `billing_provider_cancel_skipped job=${job.id} sub=${ref}: a one-time order`,
            );
            return;
        }
        const atCycleEnd = p.atCycleEnd !== false;
        try {
            await provider.cancelSubscription(ref, { atCycleEnd });
            this.logger.log(
                `billing_provider_cancelled job=${job.id} sub=${ref} atCycleEnd=${atCycleEnd}`,
            );
            trail("ok");
            return;
        } catch (error) {
            const refused = isRefused(error);
            trail(refused ? "refused" : errorResult(error));
            if (!refused) throw error;
            this.logger.warn(
                `billing_provider_cancel_refused job=${job.id} sub=${ref}: ${error.message}`,
            );
        }

        // Refused: where does it stand?
        const standing: SubscriptionStanding = await (
            provider.statuses?.subscriptionStanding?.(ref) ??
            Promise.resolve<SubscriptionStanding>("unknown")
        ).catch((): SubscriptionStanding => "unknown");
        if (standing === "ended" || (atCycleEnd && standing === "last-cycle")) {
            this.logger.log(
                `billing_provider_cancel_settled job=${job.id} sub=${ref} standing=${standing}`,
            );
            return;
        }
        if (
            atCycleEnd &&
            (standing === "authorised" || standing === "created")
        ) {
            // No cycle running: Razorpay takes only a cancel now, and the
            // plan runs to its date by Saroh's own (`runsToMoveDate`).
            try {
                await provider.cancelSubscription(ref, { atCycleEnd: false });
                this.logger.log(
                    `billing_provider_cancelled job=${job.id} sub=${ref} atCycleEnd=false (no cycle running)`,
                );
                return;
            } catch (error) {
                if (!isRefused(error)) throw error;
            }
        }
        await this.again(
            job,
            {
                provider: p.provider,
                providerSubscriptionId: ref,
                atCycleEnd,
                tries: p.tries,
            },
            standing,
        );
    };

    /** Ask again later; tell an operator once it has been refused long enough. */
    private async again(
        job: Job,
        p: ProviderCancelPayload,
        standing: SubscriptionStanding,
    ): Promise<void> {
        const tries = (p.tries ?? 0) + 1;
        const organizationId = job.organizationId;
        await prisma.$transaction(async (tx) => {
            if (
                tries === CANCEL_ALERT_AFTER ||
                tries === CANCEL_GIVE_UP_AFTER
            ) {
                const final = tries === CANCEL_GIVE_UP_AFTER;
                const code = final
                    ? "billing_provider_cancel_given_up"
                    : "billing_provider_cancel_stuck";
                if (organizationId) {
                    await raiseBillingOpsNoticeInTx(tx, this.logger, {
                        code,
                        organizationId,
                        refs: {
                            provider: p.provider,
                            providerSubscription: p.providerSubscriptionId,
                            standing,
                            tries: String(tries),
                        },
                        note: final
                            ? "Saroh stopped asking the billing provider to cancel this subscription after a week of refusals. Cancel it in the provider's dashboard, and refund any charge it takes for a plan the business isn't on."
                            : "The billing provider keeps refusing to cancel this subscription, and it may go on charging while Saroh shows another plan. Check it in the provider's dashboard and cancel it there if it's still live.",
                    });
                } else {
                    this.logger.error(
                        `${code} job=${job.id} sub=${p.providerSubscriptionId} standing=${standing} tries=${tries}`,
                    );
                }
            }
            if (tries >= CANCEL_GIVE_UP_AFTER) return;
            const delay =
                CANCEL_RETRY_DELAYS_MS[
                    Math.min(tries - 1, CANCEL_RETRY_DELAYS_MS.length - 1)
                ] ?? 0;
            await enqueueProviderCancel(
                tx,
                {
                    organizationId,
                    provider: p.provider,
                    providerSubscriptionId: p.providerSubscriptionId,
                    atCycleEnd: p.atCycleEnd,
                    tries,
                },
                new Date(Date.now() + delay),
            );
        });
    }
}
