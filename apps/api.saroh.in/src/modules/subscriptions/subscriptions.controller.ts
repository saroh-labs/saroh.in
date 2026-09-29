import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
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
import { payLinkUrl } from "../invoices/pay-link-url";
import {
    CancelSubscriptionDto,
    ChangePlanDto,
    CollectionScheduleDto,
    DeleteDraftQueryDto,
    DraftRevisionDto,
    ListPlanEventsQueryDto,
    ListPlansQueryDto,
    ListSubscriptionEventsQueryDto,
    ListSubscriptionsQueryDto,
    PauseSubscriptionDto,
    PlanChargeTimingDto,
    PlanDraftDto,
    PlanInputDto,
    RetryPaymentDto,
    SkipCollectionDto,
    SubscribeDto,
    SubscriptionSettingsDto,
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

    /** The plan's history, newest first, a page at a time (D2). */
    @Get(":planId/events")
    events(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Query() query: ListPlanEventsQueryDto,
    ) {
        return this.subscriptions.planEvents(ctx, id, query);
    }

    @Post()
    @HttpCode(201)
    create(@OrgContext() ctx: OrganizationContext, @Body() dto: PlanInputDto) {
        return this.subscriptions.createPlan(ctx, dto);
    }

    // — The Plan Editor's drafts (D5) ——————————————————————————————
    // Each write answers with the plan as the editor reads it; a stale
    // `revision` is a 409 naming who saved since, and writes nothing.

    /** The editor's first save of a new plan, which makes it a DRAFT. */
    @Post("drafts")
    @HttpCode(201)
    createDraft(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: PlanInputDto,
    ) {
        return this.subscriptions.createPlanDraft(ctx, dto);
    }

    /** The plan as the editor reads it, with its draft revision. */
    @Get(":planId/draft")
    getDraft(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
    ) {
        return this.subscriptions.getPlanEditor(ctx, id);
    }

    /** Autosave: a draft's fields, or a live plan's unpublished changes. */
    @Patch(":planId/draft")
    saveDraft(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Body() dto: PlanDraftDto,
    ) {
        return this.subscriptions.savePlanDraft(ctx, id, dto);
    }

    @Post(":planId/publish")
    @HttpCode(200)
    publish(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Body() dto: DraftRevisionDto,
    ) {
        return this.subscriptions.publishPlan(ctx, id, dto.revision);
    }

    @Post(":planId/discard")
    @HttpCode(200)
    discard(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Body() dto: DraftRevisionDto,
    ) {
        return this.subscriptions.discardPlanChanges(ctx, id, dto.revision);
    }

    /** Delete a draft nobody has bought; a published plan is archived. */
    @Delete(":planId")
    @HttpCode(204)
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Query() query: DeleteDraftQueryDto,
    ): Promise<void> {
        await this.subscriptions.deletePlanDraft(ctx, id, query.revision);
    }

    /**
     * The plan's own "When autopay charges" (D13B), or null for the
     * business's setting. Straight onto the plan, not its draft.
     */
    @Patch(":planId/autopay-timing")
    setChargeTiming(
        @OrgContext() ctx: OrganizationContext,
        @Param("planId") id: string,
        @Body() dto: PlanChargeTimingDto,
    ) {
        return this.subscriptions.setPlanChargeTiming(
            ctx,
            id,
            dto.autopayChargeTiming,
        );
    }

    /**
     * The old Plans form's whole-plan save, kept for one release while the
     * app moves to the editor (D7); removed by follow-up Z6. Refuses a draft.
     */
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

    /** "Members can pause from their account" (A8); before `:subscriptionId` too. */
    @Get("settings")
    settings(@OrgContext() ctx: OrganizationContext) {
        return this.subscriptions.settings(ctx);
    }

    @Patch("settings")
    updateSettings(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SubscriptionSettingsDto,
    ) {
        return this.subscriptions.updateSettings(ctx, dto);
    }

    @Get(":subscriptionId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
    ) {
        return this.subscriptions.get(ctx, id);
    }

    /** What was done to it and by whom, newest first, a page at a time (D9). */
    @Get(":subscriptionId/events")
    events(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Query() query: ListSubscriptionEventsQueryDto,
    ) {
        return this.subscriptions.events(ctx, id, query);
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
        @Body() dto: PauseSubscriptionDto,
    ) {
        return this.subscriptions.pause(ctx, id, dto);
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
     * Retry a failed renewal (D13): charge their autopay again (`via`
     * MANDATE) or make a new pay link (PAY_LINK, the default), replacing
     * the old one. A pay link's token and address are answered once
     * (Home's "Retry by pay link", F4); an autopay retry answers without
     * one. `paid`: the provider had already captured it.
     */
    @Post(":subscriptionId/retry")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async retry(
        @OrgContext() ctx: OrganizationContext,
        @Param("subscriptionId") id: string,
        @Body() dto: RetryPaymentDto,
    ) {
        const done = await this.subscriptions.retryPayment(ctx, id, dto.via);
        return {
            ...done,
            url: done.token ? payLinkUrl(done.token) : null,
        };
    }
}
