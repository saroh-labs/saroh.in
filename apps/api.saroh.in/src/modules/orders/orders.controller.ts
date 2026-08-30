import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CreateOrderDto, UpdateOrderDto } from "./dto";
import { OrdersService } from "./orders.service";

@Controller("stores/:storeId/orders")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrdersController {
    constructor(private readonly orders: OrdersService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.orders.list(storeId, user.id);
    }

    @Post()
    @HttpCode(201)
    create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateOrderDto,
    ) {
        return this.orders.create(storeId, user.id, dto);
    }

    @Get(":orderId")
    get(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("orderId") orderId: string,
    ) {
        return this.orders.get(storeId, orderId, user.id);
    }

    @Patch(":orderId")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("orderId") orderId: string,
        @Body() dto: UpdateOrderDto,
    ) {
        return this.orders.updateStatus(storeId, orderId, user.id, dto);
    }
}
