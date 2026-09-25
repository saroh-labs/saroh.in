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

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { SetSoldOutDto, SetStockTrackingDto } from "../stock/dto";
import type { ProductStatus } from "./dto";
import {
    CreateProductDto,
    PatchProductDto,
    ReplaceProductImagesDto,
    UpdateProductDto,
} from "./dto";
import { UpdateInventoryDto, UpdateVariantStockDto } from "./inventory.dto";
import { InventoryService } from "./inventory.service";
import { ProductAccess } from "./product-access";
import { ProductImagesService } from "./product-images.service";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsService } from "./products.service";
import { SoldOutService } from "./sold-out.service";
import {
    CreateVariantDto,
    ReorderVariantsDto,
    UpdateVariantDto,
} from "./variants.dto";
import { VariantsService } from "./variants.service";

/**
 * The business's products (#531). Org-nested, so the business comes from the
 * path the guard proved; reading needs `store:read`, changing needs
 * `store:write`. The catalogue belongs to the business: `?storefront=` names
 * the storefront whose shelf and listing a request reads or writes (the one
 * the screen is open at), and on the list it filters by listing. Left out,
 * a product is read at the first storefront that sells it.
 *
 * The old `stores/:storeId/products` routes are aliases of these for one
 * release (`ProductsController`, `ProductDetailsController`).
 */
@Controller("organizations/:organizationId/products")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationProductsController {
    constructor(
        private readonly access: ProductAccess,
        private readonly products: ProductsService,
        private readonly overview: ProductOverviewService,
        private readonly images: ProductImagesService,
        private readonly variants: VariantsService,
        private readonly inventory: InventoryService,
        private readonly soldOut: SoldOutService,
    ) {}

    /** One row per catalogue product, with where it is sold. */
    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("status") status?: ProductStatus,
        @Query("storefront") storefront?: string,
    ) {
        return this.products.catalogue(
            this.access.business(ctx).organizationId,
            { status, storefront },
        );
    }

    /** A new product, sold at the storefront named (or the only one). */
    @Post()
    @HttpCode(201)
    async create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateProductDto,
        @Query("storefront") storefront?: string,
    ) {
        return this.products.createIn(
            await this.access.write(ctx, undefined, storefront),
            dto,
        );
    }

    @Get(":productId")
    async get(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Query("storefront") storefront?: string,
    ) {
        return this.products.getIn(
            await this.access.read(ctx, productId, storefront),
            productId,
        );
    }

    /** The product page: product, stock by variant, and its panels. */
    @Get(":productId/overview")
    async getOverview(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Query("storefront") storefront?: string,
    ) {
        return this.overview.getIn(
            await this.access.read(ctx, productId, storefront),
            productId,
        );
    }

    /** One editor section's save; returns the whole product. */
    @Patch(":productId")
    async patch(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: PatchProductDto,
        @Query("storefront") storefront?: string,
    ) {
        return this.products.patchIn(
            await this.access.write(ctx, productId, storefront),
            productId,
            dto,
        );
    }

    @Put(":productId")
    async update(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: UpdateProductDto,
    ) {
        return this.products.updateIn(
            await this.access.write(ctx, productId),
            productId,
            dto,
        );
    }

    /**
     * A draft copy, sold where the original is, stock at 0 (#518). Returns
     * the copy as `GET :productId` does.
     */
    @Post(":productId/duplicate")
    @HttpCode(201)
    async duplicate(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Query("storefront") storefront?: string,
    ) {
        return this.products.duplicateIn(
            await this.access.write(ctx, productId, storefront),
            productId,
        );
    }

    /** Delete the product from the catalogue, and so every storefront. */
    @Delete(":productId")
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
    ) {
        return this.products.removeIn(
            await this.access.write(ctx, productId),
            productId,
        );
    }

    // ---- Photos and videos ----

    @Get(":productId/images")
    async listImages(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
    ) {
        return this.images.listIn(
            await this.access.read(ctx, productId),
            productId,
        );
    }

    /** Replace the ordered photo set; the first is the cover. */
    @Put(":productId/images")
    async replaceImages(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: ReplaceProductImagesDto,
    ) {
        return this.images.replaceIn(
            await this.access.write(ctx, productId),
            productId,
            dto,
        );
    }

    // ---- Variants ----

    @Get(":productId/variants")
    async listVariants(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Query("storefront") storefront?: string,
    ) {
        return this.variants.listIn(
            await this.access.read(ctx, productId, storefront),
            productId,
        );
    }

    @Post(":productId/variants")
    @HttpCode(201)
    async createVariant(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: CreateVariantDto,
    ) {
        return this.variants.createIn(
            await this.access.write(ctx, productId),
            productId,
            dto,
        );
    }

    /** The variants in the order customers see them. */
    @Put(":productId/variants/order")
    async reorderVariants(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: ReorderVariantsDto,
        @Query("storefront") storefront?: string,
    ) {
        return this.variants.reorderIn(
            await this.access.write(ctx, productId, storefront),
            productId,
            dto,
        );
    }

    @Put(":productId/variants/:variantId")
    async updateVariant(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Param("variantId") variantId: string,
        @Body() dto: UpdateVariantDto,
    ) {
        return this.variants.updateIn(
            await this.access.write(ctx, productId),
            productId,
            variantId,
            dto,
        );
    }

    @Delete(":productId/variants/:variantId")
    async removeVariant(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Param("variantId") variantId: string,
    ) {
        return this.variants.removeIn(
            await this.access.write(ctx, productId),
            productId,
            variantId,
        );
    }

    // ---- Stock at a storefront ----

    @Get(":productId/inventory")
    async getInventory(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Query("storefront") storefront?: string,
    ) {
        return this.inventory.getIn(
            await this.access.read(ctx, productId, storefront),
            productId,
        );
    }

    /** Every variant's count at once; switches the product to per-variant. */
    @Put(":productId/inventory/variants")
    async setVariantStock(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: UpdateVariantStockDto,
        @Query("storefront") storefront?: string,
    ) {
        return this.inventory.setVariantsIn(
            await this.access.write(ctx, productId, storefront),
            productId,
            dto,
        );
    }

    @Put(":productId/inventory")
    async setInventory(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: UpdateInventoryDto,
        @Query("storefront") storefront?: string,
    ) {
        return this.inventory.upsertIn(
            await this.access.write(ctx, productId, storefront),
            productId,
            dto,
        );
    }

    /**
     * Track stock on or off for the product everywhere it sells (#515):
     * `store:write`, never `inventory:write` alone. Off is refused while
     * open orders hold its units and counts each shelf to 0.
     */
    @Put(":productId/stock-tracking")
    async setStockTracking(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: SetStockTrackingDto,
    ) {
        return this.inventory.setTrackingIn(
            await this.access.write(ctx, productId),
            productId,
            dto.tracked,
        );
    }

    /**
     * Mark an untracked product Sold out at a storefront, or available again
     * (#515): whoever may count and move stock. A product that counts stock
     * is refused (409); a storefront that doesn't sell it is not found.
     */
    @Put(":productId/sold-out")
    setSoldOut(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Body() dto: SetSoldOutDto,
    ) {
        return this.soldOut.set(ctx, productId, dto.storefrontId, dto.soldOut);
    }
}
