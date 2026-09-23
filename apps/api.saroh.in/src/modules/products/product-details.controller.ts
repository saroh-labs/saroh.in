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
import { UpdateInventoryDto, UpdateVariantStockDto } from "./inventory.dto";
import { InventoryService } from "./inventory.service";
import {
    CreateVariantDto,
    ReorderVariantsDto,
    UpdateVariantDto,
} from "./variants.dto";
import { VariantsService } from "./variants.service";

/**
 * Variants + inventory for a product. Both are scoped to a product within a
 * store; the services delegate authorization (read/write) to ProductsService.
 */
@Controller("stores/:storeId/products/:productId")
@UseGuards(BetterAuthGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class ProductDetailsController {
    constructor(
        private readonly variants: VariantsService,
        private readonly inventory: InventoryService,
    ) {}

    @Get("variants")
    listVariants(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.variants.list(storeId, productId, user.id);
    }

    @Post("variants")
    @HttpCode(201)
    createVariant(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: CreateVariantDto,
    ) {
        return this.variants.create(storeId, productId, user.id, dto);
    }

    /** The variants in the order customers see them. */
    @Put("variants/order")
    reorderVariants(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: ReorderVariantsDto,
    ) {
        return this.variants.reorder(storeId, productId, user.id, dto);
    }

    @Put("variants/:variantId")
    updateVariant(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Param("variantId") variantId: string,
        @Body() dto: UpdateVariantDto,
    ) {
        return this.variants.update(
            storeId,
            productId,
            variantId,
            user.id,
            dto,
        );
    }

    @Delete("variants/:variantId")
    removeVariant(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Param("variantId") variantId: string,
    ) {
        return this.variants.remove(storeId, productId, variantId, user.id);
    }

    @Get("inventory")
    getInventory(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
    ) {
        return this.inventory.get(storeId, productId, user.id);
    }

    /** Every variant's count at once; switches the product to per-variant. */
    @Put("inventory/variants")
    setVariantStock(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: UpdateVariantStockDto,
    ) {
        return this.inventory.setVariants(storeId, productId, user.id, dto);
    }

    @Put("inventory")
    setInventory(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("productId") productId: string,
        @Body() dto: UpdateInventoryDto,
    ) {
        return this.inventory.upsert(storeId, productId, user.id, dto);
    }
}
