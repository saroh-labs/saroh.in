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
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto";

@Controller("stores/:storeId/categories")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class CategoriesController {
    constructor(private readonly categories: CategoriesService) {}

    @Get()
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.categories.list(storeId, user.id);
    }

    @Post()
    @HttpCode(201)
    create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateCategoryDto,
    ) {
        return this.categories.create(storeId, user.id, dto);
    }

    @Put(":categoryId")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.categories.update(storeId, categoryId, user.id, dto);
    }

    @Delete(":categoryId")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("categoryId") categoryId: string,
    ) {
        return this.categories.remove(storeId, categoryId, user.id);
    }
}
