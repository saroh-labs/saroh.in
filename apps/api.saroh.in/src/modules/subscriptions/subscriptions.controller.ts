import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import {
    IgnoreModuleReadiness,
    RequireModule,
} from "../capabilities/require-module.decorator";
import {
    CancelSubscriptionDto,
    ChangePlanDto,
    CollectionScheduleDto,
    ListPlansQueryDto,
    ListSubscriptionsQueryDto,
    PlanInputDto,
    SkipCollectionDto,
    SubscribeDto,
} from "./dto";
import { SubscriptionsService } from "./subscriptions.service";

/**
 * Billing → Subscriptions → Plans (ADR-007). Under Payments without its
 * provider setup, like invoices: a membership invoiced each period and paid
 * at the desk needs no provider. Authorization is in the service.
 */
@Controller("organizations/:organizationId/subscription-plans")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("PAYMENTS")
@IgnoreModuleReadiness()
export class SubscriptionPlansController {
    constructor(private readonly subscriptions: SubscriptionsService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListPlansQueryDto,
    ) {
        return this.subscriptions.listPlans(ctx, query);
    }

    @Get(":planId")
    get(@OrgContext() ctx: OrganizationContext, @Param("planId") id: string) {
        return this.subscriptions.getPlan(ctx, id);
    }

    @Post()
    @HttpCode(201)
    create(@OrgContext() ctx: OrganizationContext, @Body() dto: PlanInputDto) {
        return this.subscriptions.createPlan(ctx, dto);
    }

    @Patch(":planId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Body() dto: PlanInputDto,
    ) {
        return this.subscriptions.updatePlan(ctx, id, dto);
    }

    @Post(":planId/archive")
    @HttpCode(200)
    archive(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
    ) {
        return this.subscriptions.setPlanStatus(ctx, id, "ARCHIVED");
    }

    @Post(":planId/restore")
    @HttpCode(200)
    restore(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
    ) {
        return this.subscriptions.setPlanStatus(ctx, id, "ACTIVE");
    }
}

/** Billing → Subscriptions: the people on a plan. */
@Controller("organizations/:organizationId/subscriptions")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("PAYMENTS")
@IgnoreModuleReadiness()
export class SubscriptionsController {
    constructor(private readonly subscriptions: SubscriptionsService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ListSubscriptionsQueryDto,
    ) {
        return this.subscriptions.list(ctx, query);
    }

    /** Declared before `:subscriptionId`, or "renewals" would be read as an id. */
    @Get("renewals")
    renewals(@OrgContext() ctx: OrganizationContext) {
        return this.subscriptions.renewals(ctx);
    }

    @Get(":subscriptionId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.get(ctx, id);
    }

    /** Subscribe a contact; answers with the subscription and issues its first invoice. */
    @Post()
    @HttpCode(201)
    subscribe(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SubscribeDto,
    ) {
        return this.subscriptions.subscribe(ctx, dto);
    }

    @Post(":subscriptionId/pause")
    @HttpCode(200)
    pause(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.pause(ctx, id);
    }

    @Post(":subscriptionId/resume")
    @HttpCode(200)
    resume(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.resume(ctx, id);
    }

    @Post(":subscriptionId/cancel")
    @HttpCode(200)
    cancel(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Body() dto: CancelSubscriptionDto,
    ) {
        return this.subscriptions.cancel(ctx, id, dto);
    }

    /** Undo a cancel-at-period-end. */
    @Post(":subscriptionId/keep")
    @HttpCode(200)
    keep(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.keep(ctx, id);
    }

    /** Set or stop the collection schedule (weekday and what is collected). */
    @Patch(":subscriptionId/collection")
    setCollection(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Body() dto: CollectionScheduleDto,
    ) {
        return this.subscriptions.setCollection(ctx, id, dto);
    }

    /** Skip one collection still to come. */
    @Post(":subscriptionId/skips")
    @HttpCode(200)
    skip(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Body() dto: SkipCollectionDto,
    ) {
        return this.subscriptions.skipCollection(ctx, id, dto);
    }

    /** Undo a skip: the collection is back. */
    @Delete(":subscriptionId/skips/:date")
    unskip(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Param("date") date: string,
    ) {
        return this.subscriptions.unskipCollection(ctx, id, date);
    }

    /** Change plan from the next renewal. */
    @Post(":subscriptionId/plan-change")
    @HttpCode(200)
    changePlan(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Body() dto: ChangePlanDto,
    ) {
        return this.subscriptions.changePlan(ctx, id, dto);
    }

    /** Undo a booked plan change. */
    @Delete(":subscriptionId/plan-change")
    cancelPlanChange(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.cancelPlanChange(ctx, id);
    }

    /**
     * Retry a failed charge: a new pay link for the overdue latest invoice,
     * replacing the old one. Answers with the token, shown once.
     */
    @Post(":subscriptionId/retry")
    @HttpCode(200)
    retry(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.retryPayment(ctx, id);
    }
}
