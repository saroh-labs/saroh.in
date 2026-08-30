import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto, UpdateCustomerDto } from "./dto";

@Controller("stores/:storeId/customers")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class CustomersController {
    constructor(private readonly customers: CustomersService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.customers.list(storeId, user.id);
    }

    @Post()
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

    @Put(":customerId")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("customerId") customerId: string,
        @Body() dto: UpdateCustomerDto,
    ) {
        return this.customers.update(storeId, customerId, user.id, dto);
    }
}
