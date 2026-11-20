import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { IsString, Matches, MaxLength } from "class-validator";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import type { PageResults } from "./page-results";
import { PageResultsService } from "./page-results";

export class PageResultsQueryDto {
    /** The page's link on the site, `/` or `/bridal`; a query is cut off. */
    @IsString()
    @Matches(/^\//, { message: "path must start with /" })
    @MaxLength(2048)
    path!: string;
}

/**
 * A page's results, "This page · last 7 days" (website editor plan U47a).
 * `site:read`, reviewer-scoped; results null without `analytics:read`.
 */
@Controller("organizations/:organizationId/sites/:siteId/results")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class PageResultsController {
    constructor(private readonly results: PageResultsService) {}

    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Query() query: PageResultsQueryDto,
    ): Promise<{ results: PageResults | null }> {
        return this.results.read(ctx, siteId, query.path);
    }
}
