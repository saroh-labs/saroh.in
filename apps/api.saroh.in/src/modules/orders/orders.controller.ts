import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { orderPayLinkUrlFor } from "../invoices/pay-link-url";
import { CreateOrderDto, UpdateOrderDto } from "./dto";
import { OrdersService } from "./orders.service";

/**
 * A storefront's orders. Commerce gates taking and changing an order, per
 * handler; reading the orders already taken is history, and stays open
 * when a business switches Commerce off (#117, `MODULE_ROLLOUT.md`). The
 * service still asks `order:read` of every read.
 */
@Controller("stores/:storeId/orders")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
export class OrdersController {
    constructor(private readonly orders: OrdersService) {}

    /** History: not module-gated. */
    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.orders.list(storeId, user.id);
    }

    /**
     * Make an order by hand. With New order v2's "Send a payment link"
     * (B13) the answer carries the order's pay link — once: only its hash
     * is kept (B11).
     */
    @Post()
    @RequireModule("COMMERCE")
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateOrderDto,
    ): Promise<{
        id: string;
        payLink?: { url: string; payLinkCreatedAt: Date };
    }> {
        const made = await this.orders.create(storeId, user.id, dto);
        return "payLink" in made && made.payLink
            ? {
                  id: made.id,
                  payLink: {
                      url: await orderPayLinkUrlFor(
                          made.organizationId,
                          made.payLink.token,
                      ),
                      payLinkCreatedAt: made.payLink.payLinkCreatedAt,
                  },
              }
            : { id: made.id };
    }

    /**
     * New order's lines (B13): the ways an order of these products can
     * leave this storefront, with what each adds, and each product's
     * allergens for the allergy clash. `?products=a,b`; none, the
     * storefront's own ways.
     */
    @Get("new-order")
    @RequireModule("COMMERCE")
    newOrderLines(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("products") products?: string,
    ) {
        const ids = (products ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, 100);
        return this.orders.newOrderLines(storeId, user.id, ids);
    }

    /** History: not module-gated. */
    @Get(":orderId")
    get(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("orderId") orderId: string,
    ) {
        return this.orders.get(storeId, orderId, user.id);
    }

    @Patch(":orderId")
    @RequireModule("COMMERCE")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("orderId") orderId: string,
        @Body() dto: UpdateOrderDto,
    ) {
        return this.orders.updateStatus(storeId, orderId, user.id, dto);
    }
}
