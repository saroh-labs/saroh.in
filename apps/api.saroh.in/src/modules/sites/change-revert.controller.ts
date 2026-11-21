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
import type { RevertResult } from "./change-revert";
import { ChangeRevertService } from "./change-revert";

export class RevertChangeDto {
    /** The change unit's key, as `GET …/changes` names it. */
    @IsString()
    @MinLength(1)
    @MaxLength(300)
    unitKey!: string;

    /** A section's page draft revision the editor holds; stale is a 409. */
    @IsOptional()
    @IsInt()
    @Min(0)
    revision?: number;
}

/**
 * History's Undo: one waiting change put back as it is live (website editor
 * plan U47a). The permission of the write the change was made with.
 */
@Controller("organizations/:organizationId/sites/:siteId/changes/revert")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class ChangeRevertController {
    constructor(private readonly changes: ChangeRevertService) {}

    @Post()
    @HttpCode(200)
    revert(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: RevertChangeDto,
    ): Promise<RevertResult> {
        return this.changes.revert(ctx, siteId, dto);
    }
}
