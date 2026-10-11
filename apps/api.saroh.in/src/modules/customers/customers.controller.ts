import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { StoreLifecycleGuard } from "../../common/guards/store-lifecycle.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto";

/**
 * A storefront's customers. Commerce gates adding, changing and removing
 * one, per handler; reading the customers already on the books is history,
 * and stays open when a business switches Commerce off (#117,
 * `MODULE_ROLLOUT.md`). The service still asks `order:read` of every read.
 */
@Controller("stores/:storeId/customers")
@UseGuards(BetterAuthGuard, StoreLifecycleGuard, ModuleEnforcementGuard)
export class CustomersController {
    constructor(private readonly customers: CustomersService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.customers.list(storeId, user.id);
    }

    @Post()
    @RequireModule("COMMERCE")
    @HttpCode(201)
    create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateCustomerDto,
    ) {
        return this.customers.create(storeId, user.id, dto);
    }

    @Get(":customerId")
    get(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("customerId") customerId: string,
    ) {
        return this.customers.get(storeId, customerId, user.id);
    }

    @Delete(":customerId")
    @RequireModule("COMMERCE")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("customerId") customerId: string,
    ) {
        return this.customers.remove(storeId, customerId, user.id);
    }

    @Put(":customerId")
    @RequireModule("COMMERCE")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("customerId") customerId: string,
        @Body() dto: UpdateCustomerDto,
    ) {
        return this.customers.update(storeId, customerId, user.id, dto);
    }
}
