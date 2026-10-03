import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";

import type { BillingProviderFactory } from "./providers/billing-provider.port";
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
 * A refusal (a 4xx: already cancelled, never authorised) is the provider's
 * settled answer and isn't retried; anything unanswered is.
 */
export const BILLING_PROVIDER_CANCEL_TYPE = "billing.provider.cancel";

export interface ProviderCancelPayload {
    provider: string;
    providerSubscriptionId: string;
    /** End with the period already paid (true) or now (false). */
    atCycleEnd: boolean;
}

export async function enqueueProviderCancel(
    tx: Pick<Prisma.TransactionClient, "job">,
    input: ProviderCancelPayload & { organizationId: string },
): Promise<void> {
    await tx.job.create({
        data: {
            type: BILLING_PROVIDER_CANCEL_TYPE,
            organizationId: input.organizationId,
            payload: {
                provider: input.provider,
                providerSubscriptionId: input.providerSubscriptionId,
                atCycleEnd: input.atCycleEnd,
            },
        },
    });
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
        try {
            await this.providers
                .get(p.provider)
                .cancelSubscription(p.providerSubscriptionId, {
                    atCycleEnd: p.atCycleEnd !== false,
                });
            this.logger.log(
                `billing_provider_cancelled job=${job.id} sub=${p.providerSubscriptionId} atCycleEnd=${p.atCycleEnd !== false}`,
            );
        } catch (error) {
            if (
                error instanceof BillingProviderError &&
                error.kind === "REFUSED"
            ) {
                this.logger.warn(
                    `billing_provider_cancel_refused job=${job.id} sub=${p.providerSubscriptionId}: ${error.message}`,
                );
                return;
            }
            throw error;
        }
    };
}
