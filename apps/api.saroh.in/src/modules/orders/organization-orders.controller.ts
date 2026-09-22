import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { authorize } from "../organizations/organization-policy";
import { OrdersService } from "./orders.service";

/**
 * Orders across the whole business — what Sell → Orders reads.
 *
 * Its own controller rather than another route on `OrdersController`, because
 * the two are scoped by different things and that difference is the entire
 * security boundary: the store-scoped one takes a `:storeId` from the path and
 * checks the caller against that store, while this one takes its organization
 * from `OrganizationGuard` and never trusts a tenant id off the wire.
 * Splitting them keeps a guard from being the only thing standing between the
 * two, where a future edit could quietly move a route across the line.
 *
 * A merchant with three storefronts had no way to see the orders waiting in
 * all of them at once; the rail badged a number that no screen could show.
 */
@Controller("organizations/:organizationId/orders")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationOrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("storeId") storeId?: string,
    ) {
        // The guards prove the caller belongs to this business and that
        // Commerce is on. Neither says they may see its ORDERS — customer
        // names, emails and totals across every storefront. This line was
        // missing when the screen first shipped, and a Reviewer, brought in to
        // look at one website, could list every order in the business.
        authorize(ctx, "order:read");
        return this.orders.listForOrganization(ctx.organizationId, {
            // Narrows within the organization; it cannot widen past it.
            // `??` would keep an empty string, which would filter on a
            // storefront that cannot exist and return nothing.
            storeId: storeId === "" ? undefined : storeId,
        });
    }
}
