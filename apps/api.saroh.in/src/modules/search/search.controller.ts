import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { SearchService } from "./search.service";

/**
 * Cross-entity quick search for the command palette.
 *
 * Double-guarded like every org-scoped read: `BetterAuthGuard` authenticates and
 * `OrganizationGuard` resolves a proven {@link OrganizationContext} from the
 * path. The service gates each entity on its own read action on top, so the
 * palette can never become the one surface where a role sees rows the list
 * screens would have refused it.
 */
@Controller("organizations/:organizationId/search")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class SearchController {
    constructor(private readonly search: SearchService) {}

    @Get()
    query(@OrgContext() ctx: OrganizationContext, @Query("q") q?: string) {
        return this.search.search(ctx, q ?? "");
    }
}
