import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Plan, Subscription } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { CancelSubscriptionDto, SubscribeDto } from "./dto";
import { PlansService } from "./plans.service";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "./providers/billing-provider.port";

/** A `Subscription` with its resolved `Plan` embedded (the common read shape). */
export type SubscriptionWithPlan = Subscription & { plan: Plan };

/**
 * An Organization's subscription to a Saroh plan (S7-005).
 *
 * At most ONE subscription per org (`organizationId @unique`), so subscribe /
 * change-plan is an UPSERT keyed on the org. A FREE plan (`priceCents === 0`)
 * needs no billing provider — the row simply records the plan. A PAID plan
 * calls the platform {@link BillingProvider} to create the provider
 * subscription and stores `provider` / `providerSubscriptionId` /
 * `providerCustomerId`. Cancel flips `cancelAtPeriodEnd` (or, when `immediate`,
 * moves status straight to CANCELLED).
 *
 * CREDENTIAL BOUNDARY: this service touches ONLY the billing models
 * (`Subscription`, `Plan`) + Saroh's platform provider — NEVER a per-org
 * merchant payment record (`MerchantPaymentProvider` / `PaymentIntent` / …).
 * Reads require `billing:read`, writes `billing:manage`.
 */
@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly plans: PlansService,
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    /** The org's current subscription (with its plan), or null if unsubscribed. */
    async getCurrent(
        ctx: OrganizationContext,
    ): Promise<SubscriptionWithPlan | null> {
        authorize(ctx, "billing:read");
        return prisma.subscription.findUnique({
            where: { organizationId: ctx.organizationId },
            include: { plan: true },
        });
    }

    /**
     * Subscribe the org to a plan (or change plan). Authorizes `billing:manage`.
     * Resolves the latest active plan for `planKey`; a free plan upserts a
     * provider-less ACTIVE subscription, a paid plan creates the provider
     * subscription first (requires `provider`) and records its ids. One row per
     * org (upsert on `organizationId`).
     */
    async subscribe(
        ctx: OrganizationContext,
        dto: SubscribeDto,
    ): Promise<SubscriptionWithPlan> {
        authorize(ctx, "billing:manage");

        const plan = await this.plans.resolveActiveByKey(dto.planKey);

        return plan.priceCents === 0
            ? this.subscribeFree(ctx, plan)
            : this.subscribePaid(ctx, plan, dto.provider);
    }

    /**
     * Cancel the org's subscription. Authorizes `billing:manage`. Default is
     * cancel-at-period-end (`cancelAtPeriodEnd = true`, status unchanged so
     * access lasts until the period ends); `immediate` moves status to CANCELLED
     * now. When a provider subscription exists, the provider is asked to cancel
     * too. 400s when the org has no subscription.
     */
    async cancel(
        ctx: OrganizationContext,
        dto: CancelSubscriptionDto,
    ): Promise<SubscriptionWithPlan> {
        authorize(ctx, "billing:manage");

        const existing = await prisma.subscription.findUnique({
            where: { organizationId: ctx.organizationId },
        });
        if (!existing) {
            throw new BadRequestException("No subscription to cancel");
        }

        if (existing.provider && existing.providerSubscriptionId) {
            await this.providers
                .get(existing.provider)
                .cancelSubscription(existing.providerSubscriptionId);
        }

        const immediate = dto.immediate === true;
        return prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: {
                cancelAtPeriodEnd: true,
                ...(immediate ? { status: "CANCELLED" } : {}),
            },
            include: { plan: true },
        });
    }

    /** Upsert a provider-less ACTIVE subscription for a free plan. */
    private subscribeFree(
        ctx: OrganizationContext,
        plan: Plan,
    ): Promise<SubscriptionWithPlan> {
        return prisma.subscription.upsert({
            where: { organizationId: ctx.organizationId },
            create: {
                organizationId: ctx.organizationId,
                planId: plan.id,
                status: "ACTIVE",
                cancelAtPeriodEnd: false,
            },
            update: {
                planId: plan.id,
                status: "ACTIVE",
                provider: null,
                providerSubscriptionId: null,
                providerCustomerId: null,
                cancelAtPeriodEnd: false,
            },
            include: { plan: true },
        });
    }

    /** Create the provider subscription for a paid plan, then upsert the row. */
    private async subscribePaid(
        ctx: OrganizationContext,
        plan: Plan,
        provider: string | undefined,
    ): Promise<SubscriptionWithPlan> {
        if (!provider) {
            throw new BadRequestException(
                "A paid plan requires a billing provider",
            );
        }

        const result = await this.providers.get(provider).createSubscription({
            planKey: plan.key,
            planId: plan.id,
            priceCents: plan.priceCents,
            currency: plan.currency,
            interval: plan.interval,
            organizationId: ctx.organizationId,
        });

        return prisma.subscription.upsert({
            where: { organizationId: ctx.organizationId },
            create: {
                organizationId: ctx.organizationId,
                planId: plan.id,
                status: result.status,
                provider,
                providerSubscriptionId: result.providerSubscriptionId,
                providerCustomerId: result.providerCustomerId ?? null,
                currentPeriodEnd: result.currentPeriodEnd ?? null,
                cancelAtPeriodEnd: false,
            },
            update: {
                planId: plan.id,
                status: result.status,
                provider,
                providerSubscriptionId: result.providerSubscriptionId,
                providerCustomerId: result.providerCustomerId ?? null,
                currentPeriodEnd: result.currentPeriodEnd ?? null,
                cancelAtPeriodEnd: false,
            },
            include: { plan: true },
        });
    }
}
