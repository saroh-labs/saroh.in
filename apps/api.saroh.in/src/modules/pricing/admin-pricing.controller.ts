import { Body, Get, Post } from "@nestjs/common";

import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminPermission } from "../admin/admin-permissions";
import { AdminRoutes } from "../admin/admin-routes.decorator";
import type {
    AdminPricing,
    AdminPricingImpact,
    PreviewTokenResult,
} from "./catalogue.service";
import { CatalogueService } from "./catalogue.service";
import { PreviewTokenDto } from "./dto";

/**
 * Plans & modules, read side (plans catalogue U3), under `/admin/pricing`.
 * Registered by the admin module, so it sits behind the control plane's
 * guards and its routes are in the admin permission contract. Every route
 * needs `pricing:read`, minting a draft-preview link included: the token
 * shows only what the holder can already read here. Writes (U4) add their
 * own permission with their endpoint.
 */
@AdminRoutes()
export class AdminPricingController {
    constructor(private readonly catalogue: CatalogueService) {}

    @Get("pricing")
    @RequireAdminPermission(AdminPermission.PricingRead)
    pricingOverview(): Promise<AdminPricing> {
        return this.catalogue.adminPricing(new Date());
    }

    @Get("pricing/impact")
    @RequireAdminPermission(AdminPermission.PricingRead)
    pricingImpact(): Promise<AdminPricingImpact> {
        return this.catalogue.adminImpact(new Date());
    }

    @Post("pricing/preview-token")
    @RequireAdminPermission(AdminPermission.PricingRead)
    pricingPreviewToken(
        @Body() dto: PreviewTokenDto,
    ): Promise<PreviewTokenResult> {
        return this.catalogue.mintPreviewToken(dto.revision, new Date());
    }
}
