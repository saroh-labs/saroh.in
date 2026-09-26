import {
    Body,
    Controller,
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
import { RequireModule } from "../capabilities/require-module.decorator";
import { allows, authorize } from "../organizations/organization-policy";
import { EditOrderDto, MoveStageDto, UndoStageDto } from "./dto";
import { OrderKitchenService } from "./order-kitchen.service";
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
 *
 * One order's kitchen flow (ADR-008, U6) lives here too — the read Order
 * Detail renders, stage moves, undo and edits — for the same reason: it is
 * scoped by the organization, and a Member at the counter reaches it with
 * `order:stage` alone. The services authorize; see OrderKitchenService.
 */
@Controller("organizations/:organizationId/orders")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationOrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly kitchen: OrderKitchenService,
    ) {}

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
        //
        // `order:stage` reaches it too (DEC-024): a Member at the counter
        // needs the list to open the order in front of them. They get the
        // kitchen's view of it — no totals and no customer emails — the same
        // line the order read draws.
        const full = allows(ctx, "order:read");
        if (!full && !allows(ctx, "order:stage")) authorize(ctx, "order:read");
        return this.orders.listForOrganization(
            ctx.organizationId,
            {
                // Narrows within the organization; it cannot widen past it.
                // `??` would keep an empty string, which would filter on a
                // storefront that cannot exist and return nothing.
                storeId: storeId === "" ? undefined : storeId,
            },
            { kitchenOnly: !full },
        );
    }

    /** One order as Order Detail shows it; money only with a money read. */
    @Get(":orderId")
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
    ) {
        return this.kitchen.read(ctx, orderId);
    }

    /** Move to the next kitchen stage (`order:stage`). */
    @Post(":orderId/stage")
    @HttpCode(200)
    moveStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: MoveStageDto,
    ) {
        return this.kitchen.moveStage(ctx, orderId, dto);
    }

    /** Undo the last kitchen step (`order:stage`). */
    @Post(":orderId/stage/undo")
    @HttpCode(200)
    undoStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: UndoStageDto,
    ) {
        return this.kitchen.undoStage(ctx, orderId, dto.eventId);
    }

    /** Change lines, fulfilment, address or notes (`order:write`). */
    @Patch(":orderId")
    edit(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: EditOrderDto,
    ) {
        return this.kitchen.edit(ctx, orderId, dto);
    }
}
