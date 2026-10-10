import {
    Body,
    Controller,
    Delete,
    Param,
    Put,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { SetSiteIconDto } from "./dto";
import { SiteIconService } from "./site-icon.service";

/**
 * A site's own icon (DEC-120), the "Site icon" row of Website › Settings.
 * Draft state: saved here, live at the next publish. Read with the site
 * (`GET …/sites/:siteId`, `icon`).
 */
@Controller("organizations/:organizationId/sites/:siteId/icon")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class SiteIconController {
    constructor(private readonly icons: SiteIconService) {}

    /**
     * Set or replace the icon with an image the business uploaded to its
     * library. `site:update`.
     */
    @Put()
    set(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: SetSiteIconDto,
    ) {
        return this.icons.set(ctx, siteId, dto.mediaId);
    }

    /** Take the icon off. The image stays in the library. `site:update`. */
    @Delete()
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.icons.remove(ctx, siteId);
    }
}
