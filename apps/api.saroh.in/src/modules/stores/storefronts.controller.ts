import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { authorize } from "../organizations/organization-policy";
import { UpdateStorefrontDto } from "./storefronts.dto";
import { StorefrontsService } from "./storefronts.service";

/**
 * Sell → Storefronts: every storefront in the business, and its settings.
 *
 * Its own org-scoped controller, like Sell → Orders, rather than more routes
 * on `/stores/:id`: those still run the legacy owner/member dual path, and a
 * business-wide screen should be decided by the actor's permissions alone.
 * Every route authorizes — the guards prove membership and that Commerce is
 * on, and neither says what this person may do with a storefront.
 */
@Controller("organizations/:organizationId/storefronts")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class StorefrontsController {
    constructor(private readonly storefronts: StorefrontsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "store:read");
        return this.storefronts.list(ctx.organizationId);
    }

    @Get(":storeId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
    ) {
        authorize(ctx, "store:read");
        return this.storefronts.get(ctx.organizationId, storeId);
    }

    @Patch(":storeId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
        @Body() dto: UpdateStorefrontDto,
    ) {
        authorize(ctx, "store:write");
        return this.storefronts.update(ctx.organizationId, storeId, dto);
    }

    @Delete(":storeId")
    @HttpCode(204)
    async close(
        @OrgContext() ctx: OrganizationContext,
        @Param("storeId") storeId: string,
    ): Promise<void> {
        authorize(ctx, "store:delete");
        await this.storefronts.close(ctx.organizationId, storeId);
    }
}
