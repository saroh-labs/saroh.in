import {
    Body,
    Controller,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";
import {
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import type { RestoreAsDraftResult } from "./version-restore";
import { VersionRestoreService } from "./version-restore";
import { WebsiteAreaSwitchGuard } from "./website-area-switch";

export class RestoreAsDraftDto {
    /** The page the editor has open, whose revision it holds. */
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    pageId?: string;

    /** That page's draft revision; stale is a 409. */
    @IsOptional()
    @IsInt()
    @Min(0)
    revision?: number;
}

/**
 * Restore a version as the draft (owner, 20 Nov 2026): nothing goes live
 * until Publish. `section:write`, the editor's own write.
 */
@Controller(
    "organizations/:organizationId/sites/:siteId/publications/:publicationId/restore-draft",
)
// Only with the Website area on (DEC-240): off, a 404.
@UseGuards(
    BetterAuthGuard,
    OrganizationGuard,
    ModuleEnforcementGuard,
    WebsiteAreaSwitchGuard,
)
@RequireModule("WEBSITE")
export class VersionRestoreController {
    constructor(private readonly versions: VersionRestoreService) {}

    @Post()
    @HttpCode(200)
    restore(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("publicationId") publicationId: string,
        @Body() dto: RestoreAsDraftDto,
    ): Promise<RestoreAsDraftResult> {
        return this.versions.restoreAsDraft(ctx, siteId, publicationId, dto);
    }
}
