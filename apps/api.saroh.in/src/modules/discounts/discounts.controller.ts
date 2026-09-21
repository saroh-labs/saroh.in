import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { authorize } from "../organizations/organization-policy";
import { DiscountsService } from "./discounts.service";
import { DiscountInputDto } from "./dto";

/**
 * Sell → Discounts: the business's codes. Org-nested like every other
 * org-owned resource, so the guard resolves the business from the path and
 * nothing trusts a tenant id off the wire. Every route authorizes — the
 * guards prove membership and that Commerce is on, and neither says who may
 * see or change a code.
 *
 * There is no delete: ending a code is a date (R8).
 */
@Controller("organizations/:organizationId/discounts")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class DiscountsController {
    constructor(private readonly discounts: DiscountsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "discount:read");
        return this.discounts.list(ctx.organizationId);
    }

    @Get(":discountId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("discountId") id: string,
    ) {
        authorize(ctx, "discount:read");
        return this.discounts.get(ctx.organizationId, id);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: DiscountInputDto,
    ) {
        authorize(ctx, "discount:write");
        return this.discounts.create(ctx.organizationId, dto);
    }

    @Patch(":discountId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("discountId") id: string,
        @Body() dto: DiscountInputDto,
    ) {
        authorize(ctx, "discount:write");
        return this.discounts.update(ctx.organizationId, id, dto);
    }
}
