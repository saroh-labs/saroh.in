import { Body, Controller, Param, Query, Req, UseGuards } from "@nestjs/common";
import type {
    CreateOrderBody,
    ListOrdersQuery,
    OrderStatusBody,
    OrderView,
} from "@saroh/api-contract";
import {
    createOrderBody,
    id,
    listOrdersQuery,
    orderStatusBody,
    v1CreateOrder,
    v1GetOrder,
    v1ListOrders,
    v1SetOrderStatus,
} from "@saroh/api-contract";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { KeyedRequest } from "../api-keys/api-key.guard";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { OrdersService } from "../orders/orders.service";
import { authorize } from "../organizations/organization-policy";
import { orderStatus } from "./v1-enums";
import {
    onlyStorefront,
    orderById,
    ordersPage,
    orderStorefront,
    storefrontOf,
} from "./v1-reads";
import { ContractRoute, invalid, notFound, once } from "./v1-support";

const anId = new ZodContractPipe(id);
// The field keeps the code's name; what a merchant reads says location (DEC-069).
const LOCATION_FIELD = "body.storefrontId";

/**
 * Orders on `/v1` (plan 2026-11-10-001, U8): list, get, create (left
 * unpaid: taking money is the app's) and status. Writes go through
 * `OrdersService`, which checks the key's creator again at the storefront.
 */
@Controller("v1")
@UseGuards(ApiKeyGuard, ModuleEnforcementGuard)
export class OrdersV1Controller {
    constructor(
        private readonly orders: OrdersService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @ContractRoute(v1ListOrders)
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(listOrdersQuery)) query: ListOrdersQuery,
    ) {
        authorize(ctx, "order:read");
        return ordersPage(ctx.organizationId, query, ctx);
    }

    @ContractRoute(v1GetOrder)
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId", anId) orderId: string,
    ): Promise<OrderView> {
        authorize(ctx, "order:read");
        return this.order(ctx, orderId);
    }

    @ContractRoute(v1CreateOrder)
    @RequireModule("COMMERCE")
    create(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Body(new ZodContractPipe(createOrderBody)) body: CreateOrderBody,
    ): Promise<OrderView> {
        authorize(ctx, "order:create");
        return once(this.idempotency, req, ctx, body, async () => {
            const storeId = body.storefrontId
                ? await storefrontOf(ctx.organizationId, body.storefrontId)
                : await onlyStorefront(ctx.organizationId);
            if (!storeId) {
                if (body.storefrontId) throw notFound("location");
                throw invalid(
                    `${LOCATION_FIELD}: This business sells from more than one location, or none. Name one.`,
                );
            }
            const made = await this.orders.create(storeId, ctx.userId, {
                items: body.items,
                ...(body.contactId ? { contactId: body.contactId } : {}),
                ...(body.customer ? { customer: body.customer } : {}),
                ...(body.notes !== undefined ? { notes: body.notes } : {}),
            });
            return this.order(ctx, made.id);
        });
    }

    /** Wind-down, as in the app: a closing business still finishes its orders. */
    @ContractRoute(v1SetOrderStatus)
    @RequireModule("COMMERCE")
    @LifecycleWrite("wind-down")
    setStatus(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("orderId", anId) orderId: string,
        @Body(new ZodContractPipe(orderStatusBody)) body: OrderStatusBody,
    ): Promise<OrderView> {
        authorize(ctx, "order:edit");
        // Cancelling hands money back: `order:refund` too (B16).
        if (body.status === "cancelled") authorize(ctx, "order:refund");
        return once(this.idempotency, req, ctx, { orderId, body }, async () => {
            const storeId = await orderStorefront(ctx.organizationId, orderId);
            if (!storeId) throw notFound("order");
            await this.orders.updateStatus(storeId, orderId, ctx.userId, {
                status: orderStatus.in(body.status),
            });
            return this.order(ctx, orderId);
        });
    }

    private async order(ctx: OrganizationContext, orderId: string) {
        const found = await orderById(ctx.organizationId, orderId, ctx);
        if (!found) throw notFound("order");
        return found;
    }
}
