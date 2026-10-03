import {
    Body,
    Controller,
    Get,
    Header,
    Param,
    Post,
    Query,
    StreamableFile,
    UseGuards,
} from "@nestjs/common";
import type { Plan } from "@saroh/database";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { BillingAccessView } from "./catalogue-access";
import { CatalogueAccessService } from "./catalogue-access.service";
import type {
    ChangePlanQuoteView,
    ChangePlanResult,
    CheckoutsView,
} from "./checkout.service";
import { CheckoutService } from "./checkout.service";
import {
    CancelSubscriptionDto,
    ChangePlanDto,
    ChangePlanQuery,
    SubscribeDto,
} from "./dto";
import { PlansService } from "./plans.service";
import type { SarohInvoiceView } from "./saroh-invoices.service";
import { SarohInvoicesService } from "./saroh-invoices.service";
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
    constructor(
        private readonly subscriptions: SubscriptionsService,
        private readonly access: CatalogueAccessService,
        private readonly checkouts: CheckoutService,
        private readonly invoices: SarohInvoicesService,
    ) {}

    /** Saroh's invoices to the business for its plan, newest first (U17). */
    @Get("invoices")
    listInvoices(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<SarohInvoiceView[]> {
        return this.invoices.list(ctx);
    }

    /** One of them as a PDF, named for its number; never stored (U17). */
    @Get("invoices/:invoiceId/pdf")
    @Header("Cache-Control", "no-store")
    async invoicePdf(
        @OrgContext() ctx: OrganizationContext,
        @Param("invoiceId") invoiceId: string,
    ): Promise<StreamableFile> {
        const { file, fileName } = await this.invoices.pdf(ctx, invoiceId);
        return new StreamableFile(file, {
            type: "application/pdf",
            disposition: `attachment; filename="${fileName}"`,
            length: file.length,
        });
    }

    /**
     * What changing to a catalogue plan would be and cost (U15): the kind of
     * change, the recurring charge with GST, anything charged now, and when
     * it starts. `billing:read`. The site's `?plan=&cycle=` lands here.
     */
    @Get("change-plan")
    quoteChange(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ChangePlanQuery,
    ): Promise<ChangePlanQuoteView> {
        return this.checkouts.quote(ctx, query);
    }

    /**
     * Change plan (U15): to a free plan at the period's end (or now), or a
     * checkout the business authorises on the provider's page.
     * `billing:manage`.
     */
    @Post("change-plan")
    changePlan(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ChangePlanDto,
    ): Promise<ChangePlanResult> {
        return this.checkouts.changePlan(ctx, dto);
    }

    /** The checkout waiting for authorisation, and one scheduled (U15). */
    @Get("checkout")
    getCheckouts(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<CheckoutsView> {
        return this.checkouts.current(ctx);
    }

    /** What the business's plan gives it, row by row (plans catalogue U12). */
    @Get("access")
    getAccess(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<BillingAccessView> {
        return this.access.view(ctx);
    }

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
