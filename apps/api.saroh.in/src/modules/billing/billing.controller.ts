import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { Plan } from "@saroh/database";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CancelSubscriptionDto, SubscribeDto } from "./dto";
import { PlansService } from "./plans.service";
import type { SubscriptionWithPlan } from "./subscriptions.service";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Saroh plan catalog (S7-005). GLOBAL, not org-owned, so a plain authenticated
 * read (`BetterAuthGuard` only) — any signed-in user may see the offerable
 * plans. Mounted at `/billing/plans`.
 *
 * `list` returns a `Plan[]` (each carries a `Json` `entitlements`), so the
 * handler is annotated with an EXPLICIT `Promise<Plan[]>` return type (TS2883).
 */
@Controller("billing/plans")
@UseGuards(BetterAuthGuard)
export class PlansController {
    constructor(private readonly plans: PlansService) {}

    @Get()
    list(): Promise<Plan[]> {
        return this.plans.listActive();
    }
}

/**
 * Org billing endpoints (S7-005), scoped to
 * `/organizations/:organizationId/billing`.
 *
 * Double-guarded (`BetterAuthGuard` + `OrganizationGuard`); handlers receive
 * only a proven {@link OrganizationContext} via `@OrgContext()`. Reading the
 * current subscription requires `billing:read`; subscribing / changing plan /
 * cancelling requires `billing:manage` — enforced in the service.
 *
 * Handlers return `Subscription`-bearing entities (with a `Json`-bearing `Plan`),
 * so each is annotated with an EXPLICIT `Promise<...>` return type (TS2883).
 */
@Controller("organizations/:organizationId/billing")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class BillingController {
    constructor(private readonly subscriptions: SubscriptionsService) {}

    @Get("subscription")
    getSubscription(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<SubscriptionWithPlan | null> {
        return this.subscriptions.getCurrent(ctx);
    }

    @Post("subscribe")
    subscribe(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SubscribeDto,
    ): Promise<SubscriptionWithPlan> {
        return this.subscriptions.subscribe(ctx, dto);
    }

    @Post("cancel")
    cancel(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CancelSubscriptionDto,
    ): Promise<SubscriptionWithPlan> {
        return this.subscriptions.cancel(ctx, dto);
    }
}
