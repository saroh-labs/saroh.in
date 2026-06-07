import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { CreateProductDto, type ProductStatus, UpdateProductDto } from "./dto";
import { ProductsService } from "./products.service";

/**
 * Product catalog endpoints, scoped to a store. The caller is the session user
 * (BetterAuthGuard → @CurrentUser); ProductsService delegates authorization to
 * the store membership rules (read = access, write = canWrite).
 */
@Controller("stores/:storeId/products")
@UseGuards(BetterAuthGuard)
export class ProductsController {
    constructor(private readonly products: ProductsService) {}

    @Get()
    list(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Query("status") status?: ProductStatus,
    ) {
        return this.products.list(storeId, user.id, status);
    }

    @Post()
    @HttpCode(201)
    create(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: CreateProductDto,
    ) {
        return this.products.create(storeId, user.id, dto);
    }

    @Get(":productId")
    get(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.products.get(storeId, productId, user.id);
    }

    @Put(":productId")
    update(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: UpdateProductDto,
    ) {
        return this.products.update(storeId, productId, user.id, dto);
    }

    @Delete(":productId")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.products.remove(storeId, productId, user.id);
    }
}
