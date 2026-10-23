import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { StockWatchCountQueryDto } from "./stock-watch.dto";
import type { WatchCount } from "./stock-watch.service";
import { StockWatchService } from "./stock-watch.service";

/**
 * Who is waiting for a product to be back (DEC-174 U23), for the
 * workspace's count on the product page (U24):
 * `GET organizations/:organizationId/stock-watches?productId=` →
 * `{ productId, waiting, byOption }`. `store:read`, as stock levels;
 * counts only, never an address.
 */
@Controller("organizations/:organizationId/stock-watches")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("COMMERCE")
export class StockWatchesController {
    constructor(private readonly watches: StockWatchService) {}

    @Get()
    count(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: StockWatchCountQueryDto,
    ): Promise<WatchCount> {
        return this.watches.countFor(ctx, query.productId);
    }
}
