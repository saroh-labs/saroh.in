import { GoneException, Injectable } from "@nestjs/common";
import type { Plan, Subscription } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";

/** A `Subscription` with its resolved `Plan` embedded (the common read shape). */
export type SubscriptionWithPlan = Subscription & { plan: Plan };

/** What the retired writes answer: where a plan is changed now. */
export const RETIRED_BILLING_WRITE =
    "This way of changing the plan was retired. Change it in Settings › Plan (POST …/billing/change-plan).";

/**
 * An Organization's subscription to a Saroh plan (S7-005): the read.
 *
 * The first writes here — `POST …/billing/subscribe` and `…/billing/cancel`
 * — are retired (410 Gone, 17 Oct 2026). They bypassed the paid-period rule
 * (cancel `immediate` read Free at once on a period paid for) and moved a
 * business to a free plan with its provider subscription still charging
 * and its ids forgotten. Every change of plan goes through
 * `CheckoutService.changePlan` (DEC-159). The owner check still comes
 * first, so who may call them is unchanged (`plan-owner-only.spec.ts`).
 *
 * Reads require `billing:read`, writes `billing:manage` (the Owner's alone).
 */
@Injectable()
export class SubscriptionsService {
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

    /** Retired: 410 (after the owner check). */
    // eslint-disable-next-line @typescript-eslint/require-await -- refuses as a rejection, as the routes always did
    async subscribe(ctx: OrganizationContext): Promise<SubscriptionWithPlan> {
        authorize(ctx, "billing:manage");
        throw new GoneException(RETIRED_BILLING_WRITE);
    }

    /** Retired: 410 (after the owner check). */
    // eslint-disable-next-line @typescript-eslint/require-await -- refuses as a rejection, as the routes always did
    async cancel(ctx: OrganizationContext): Promise<SubscriptionWithPlan> {
        authorize(ctx, "billing:manage");
        throw new GoneException(RETIRED_BILLING_WRITE);
    }
}
