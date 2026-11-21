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
import { WebsiteAreaSwitchGuard } from "./website-area-switch";

export class PageResultsQueryDto {
    /** The page's link on the site, `/` or `/bridal`; a query is cut off. */
    @IsString()
    // No control characters: Postgres refuses a NUL in text, which was a 500.
    // eslint-disable-next-line no-control-regex
    @Matches(/^\/[^\u0000-\u001f\u007f]*$/, {
        message: "path must start with / and be a page's link",
    })
    @MaxLength(2048)
    path!: string;
}

/**
 * A page's results, "This page · last 7 days" (website editor plan U47a).
 * `site:read`, reviewer-scoped; results null without `analytics:read`.
 */
@Controller("organizations/:organizationId/sites/:siteId/results")
// Only with the Website area on (DEC-240): off, a 404.
@UseGuards(
    BetterAuthGuard,
    OrganizationGuard,
    ModuleEnforcementGuard,
    WebsiteAreaSwitchGuard,
)
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
