import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import type { ProductStatus } from "./dto";
import {
    CreateProductDto,
    PatchProductDto,
    ReplaceProductImagesDto,
    UpdateProductDto,
} from "./dto";
import { ProductImagesService } from "./product-images.service";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsService } from "./products.service";

/**
 * Product catalog endpoints, scoped to a store. The caller is the session user
 * (BetterAuthGuard → @CurrentUser); ProductsService delegates authorization to
 * the store membership rules (read = access, write = canWrite).
 */
@Controller("stores/:storeId/products")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class ProductsController {
    constructor(
        private readonly products: ProductsService,
        private readonly overview: ProductOverviewService,
        private readonly images: ProductImagesService,
    ) {}

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

    /** The product page: product, stock by variant, and its panels. */
    @Get(":productId/overview")
    getOverview(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.overview.get(storeId, productId, user.id);
    }

    /** One editor section's save; returns the whole product. */
    @Patch(":productId")
    patch(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: PatchProductDto,
    ) {
        return this.products.patch(storeId, productId, user.id, dto);
    }

    @Get(":productId/images")
    listImages(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.images.list(storeId, productId, user.id);
    }

    /** Replace the ordered photo set; the first is the cover. */
    @Put(":productId/images")
    replaceImages(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: ReplaceProductImagesDto,
    ) {
        return this.images.replace(storeId, productId, user.id, dto);
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

    /** A draft copy of the product (#518). */
    @Post(":productId/duplicate")
    @HttpCode(201)
    duplicate(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.products.duplicate(storeId, productId, user.id);
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
