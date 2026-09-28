import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { allows, authorize } from "../organizations/organization-policy";
import { UpdateStorefrontDto } from "./storefronts.dto";
import { StorefrontsService } from "./storefronts.service";

/**
 * Whoever reads Orders — the whole order (`order:read`) or the kitchen's
 * view of it (`order:stage`) — sees the notice Orders shows.
 */
function readsOrders(ctx: OrganizationContext): void {
    if (!allows(ctx, "order:read")) authorize(ctx, "order:stage");
}

/**
 * Sell → Storefronts: every storefront in the business, and its settings.
 *
 * Its own org-scoped controller, like Sell → Orders, rather than more routes
 * on `/stores/:id`: those still run the legacy owner/member dual path, and a
 * business-wide screen should be decided by the actor's permissions alone.
 * Every route authorizes — the guards prove membership and that Commerce is
 * on, and neither says what this person may do with a storefront.
 */
@Controller("organizations/:organizationId/storefronts")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class StorefrontsController {
    constructor(private readonly storefronts: StorefrontsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "store:read");
        return this.storefronts.list(ctx.organizationId);
    }

    /** How many storefronts there are, and how many the plan allows. */
    @Get("allowance")
    allowance(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "store:read");
        return this.storefronts.allowance(ctx.organizationId);
    }

    /**
     * The storefronts Orders should tell about the new Pick-up default
     * (B17's one-time notice), and whether this person may change it. For
     * anyone who reads Orders; the setting itself stays `store:write`.
     */
    @Get("late-rule-notices")
    async lateRuleNotices(@OrgContext() ctx: OrganizationContext) {
        readsOrders(ctx);
        return {
            notices: await this.storefronts.lateRuleNotices(ctx.organizationId),
            canChange: allows(ctx, "store:write"),
        };
    }

    /** Dismiss the notice for one storefront, for everyone who works there. */
    @Post(":storeId/late-rule-notice/dismiss")
    @HttpCode(204)
    async dismissLateRuleNotice(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
    ): Promise<void> {
        readsOrders(ctx);
        await this.storefronts.dismissLateRuleNotice(
            ctx.organizationId,
            storeId,
        );
    }

    @Get(":storeId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
    ) {
        authorize(ctx, "store:read");
        return this.storefronts.get(ctx.organizationId, storeId);
    }

    @Patch(":storeId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
        @Body() dto: UpdateStorefrontDto,
    ) {
        authorize(ctx, "store:write");
        // Linking customers who share an email decides whose orders join
        // whose customer record (C15): a customer-record call, as a link
        // made by hand is.
        if (dto.linkSameEmailCustomers !== undefined) {
            authorize(ctx, "contact:write");
        }
        return this.storefronts.update(
            ctx.organizationId,
            storeId,
            dto,
            ctx.userId,
        );
    }

    @Delete(":storeId")
    @HttpCode(204)
    async close(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
    ): Promise<void> {
        authorize(ctx, "store:delete");
        await this.storefronts.close(ctx.organizationId, storeId);
    }
}
