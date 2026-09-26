import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Put,
    UseGuards,
} from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { ListingsService } from "./listings.service";
import { ProductAccess } from "./product-access";

/** Sell it at a storefront: every variant, or the ones named. */
export class ListProductDto {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    variantIds?: string[];
}

/**
 * Where a catalogue product is sold (#510, #531): at each open storefront of
 * the business, whether it is listed, which variants it sells and the
 * shelf there. Listing, choosing variants and unlisting change what a
 * storefront sells, so they need `store:write`; reading needs `store:read`.
 * A product or storefront of another business is not found.
 */
@Controller("organizations/:organizationId/products/:productId/listings")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class OrganizationListingsController {
    constructor(
        private readonly access: ProductAccess,
        private readonly listings: ListingsService,
    ) {}

    @Get()
    storefronts(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
    ) {
        return this.listings.storefronts(
            this.access.business(ctx).organizationId,
            productId,
        );
    }

    /** List it at the storefront, or change which variants it sells there. */
    @Put(":storeId")
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Param("storeId") storeId: string,
        @Body() dto: ListProductDto,
    ) {
        return this.listings.list(
            this.access.writeBusiness(ctx),
            productId,
            storeId,
            dto.variantIds,
        );
    }

    /** Stop selling it there; the shelf stays, with its stock. */
    @Delete(":storeId")
    unlist(
        @OrgContext() ctx: OrganizationContext,
        @Param("productId") productId: string,
        @Param("storeId") storeId: string,
    ) {
        return this.listings.unlist(
            this.access.writeBusiness(ctx),
            productId,
            storeId,
        );
    }
}
