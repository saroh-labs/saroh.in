import {
    Body,
    Controller,
    Get,
    Header,
    Ip,
    Param,
    Post,
    Put,
    Query,
    StreamableFile,
    UseGuards,
} from "@nestjs/common";
import type { Plan } from "@saroh/database";
import { prisma } from "@saroh/database";

import { hashClientIp } from "../../common/client-ip";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AddonsView } from "./addons.service";
import { AddonsService } from "./addons.service";
import type { BillingAccessView } from "./catalogue-access";
import { CatalogueAccessService } from "./catalogue-access.service";
import type { ConfirmView } from "./checkout-confirm.service";
import { CheckoutConfirmService } from "./checkout-confirm.service";
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
    SetAddonDto,
    SubscribeDto,
} from "./dto";
import { OverLimitService } from "./over-limit.service";
import type { PausedView } from "./paused-view";
import { pausedView } from "./paused-view";
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
        private readonly addons: AddonsService,
        private readonly confirmer: CheckoutConfirmService,
        private readonly overLimit: OverLimitService,
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
     * With `coupon=`, the coupon checked and its discount shown (U16),
     * rate-limited per business and per address.
     */
    @Get("change-plan")
    quoteChange(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: ChangePlanQuery,
        @Ip() ip: string,
    ): Promise<ChangePlanQuoteView> {
        return this.checkouts.quote(ctx, query, new Date(), {
            addressKey: hashClientIp(ip),
        });
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
        @Ip() ip: string,
    ): Promise<ChangePlanResult> {
        return this.checkouts.changePlan(ctx, dto, new Date(), {
            addressKey: hashClientIp(ip),
        });
    }

    /** The add-ons the business's plan offers, and what it holds (U16). */
    @Get("addons")
    listAddons(@OrgContext() ctx: OrganizationContext): Promise<AddonsView> {
        return this.addons.list(ctx);
    }

    /**
     * Hold this many of an add-on; zero removes it (U16). Limits rise at
     * once; billed with the plan's next charge. `billing:manage`.
     */
    @Put("addons/:addonId")
    setAddon(
        @OrgContext() ctx: OrganizationContext,
        @Param("addonId") addonId: string,
        @Body() dto: SetAddonDto,
    ): Promise<AddonsView> {
        return this.addons.set(ctx, addonId, dto.quantity);
    }

    /** The checkout waiting for authorisation, and one scheduled (U15). */
    @Get("checkout")
    getCheckouts(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<CheckoutsView> {
        return this.checkouts.current(ctx);
    }

    /**
     * Back from paying (DEC-093): the checkout waiting is looked up at the
     * provider and the plan moves if it's paid, without waiting for the
     * webhook. Safe to call again and again. `billing:manage`.
     */
    @Post("checkout/confirm")
    confirmCheckout(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<ConfirmView> {
        return this.confirmer.confirm(ctx);
    }

    /** What the business's plan gives it, row by row (plans catalogue U12). */
    @Get("access")
    getAccess(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<BillingAccessView> {
        return this.access.view(ctx);
    }

    /**
     * What a move to a lower plan has paused, or will pause (#800), for the
     * workspace's marks. Anyone in the business; what it names follows
     * what the reader may already see (`paused-view.ts`).
     */
    @Get("paused")
    @Header("Cache-Control", "no-store")
    async getPaused(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<PausedView> {
        const standing = await this.overLimit.standing(ctx.organizationId);
        // The Team screen lists people by user: name the paused members'.
        const memberIds = (standing?.over ? standing.measure.people : [])
            .filter((p) => p.kind === "member")
            .map((p) => p.id);
        const rows =
            memberIds.length > 0
                ? await prisma.membership.findMany({
                      where: {
                          id: { in: memberIds },
                          organizationId: ctx.organizationId,
                      },
                      select: { id: true, userId: true },
                  })
                : [];
        return pausedView(
            standing,
            ctx,
            new Map(rows.map((r) => [r.id, r.userId])),
        );
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
